import {
  extractContour,
  getLargestContour,
  simplifyContourAdaptive,
  normalizeContour
} from '../lib/contour';
import { computeFeatures } from '../lib/descriptors';
import { findMatches } from '../lib/match';
import {
  CONTOUR_SIMPLIFY_EPSILON,
  NORMALIZED_CONTOUR_SIZE,
  DEFAULT_TOP_N,
  MIN_CONTOUR_POINTS,
  DEFAULT_EFD_ORDER,
  DEFAULT_EFD_RESAMPLE_POINTS
} from '../lib/constants';
import {
  buildCnnInputFromOutline,
  buildCnnInputFromOutlineWithMask,
  loadCnnModel,
  runCnnEmbedding
} from '../lib/cnnEmbedding';
import type { ContourRequest, ContourResponse } from './types';

/**
 * 輪郭ワーカーのメイン処理。
 * 輪郭抽出、特徴量計算、マッチング処理を制御する。
 */
let cnnHandle: Awaited<ReturnType<typeof loadCnnModel>> | null = null;
let cnnModelPathCached: string | null = null;
const prefectureEmbeddingCache = new Map<string, Float32Array>();

async function ensureCnnHandle(
  modelPath?: string
): Promise<Awaited<ReturnType<typeof loadCnnModel>> | null> {
  if (!modelPath) return null;
  if (cnnHandle && cnnModelPathCached === modelPath) return cnnHandle;
  cnnHandle = await loadCnnModel(modelPath);
  cnnModelPathCached = modelPath;
  prefectureEmbeddingCache.clear();
  return cnnHandle;
}

self.onmessage = async (e: MessageEvent<ContourRequest>) => {
  const { type, requestId } = e.data;

  try {
    if (type === 'process') {
      const { mask, width, height, cnnModelPath } = e.data;

      if (!mask || !width || !height) {
        throw new Error('Mask data is required');
      }

      postMessage({ type: 'progress', progress: 10, requestId } satisfies ContourResponse);

      // Extract contours
      const contours = extractContour(mask, width, height);

      if (contours.length === 0) {
        throw new Error('No contours found');
      }

      postMessage({ type: 'progress', progress: 30, requestId } satisfies ContourResponse);

      // Get largest contour
      const largestContour = getLargestContour(contours);

      if (!largestContour) {
        throw new Error('Failed to extract contour');
      }

      postMessage({ type: 'progress', progress: 50, requestId } satisfies ContourResponse);

      // Simplify
      const simplified = simplifyContourAdaptive(
        largestContour.points,
        CONTOUR_SIMPLIFY_EPSILON,
        MIN_CONTOUR_POINTS
      );

      postMessage({ type: 'progress', progress: 60, requestId } satisfies ContourResponse);

      // Normalize
      const normalized = normalizeContour(
        simplified,
        NORMALIZED_CONTOUR_SIZE,
        largestContour.isClosed ?? true
      );

      postMessage({ type: 'progress', progress: 80, requestId } satisfies ContourResponse);

      // Compute features (order=15, numSamples=128 to match pref_features.json)
      const features = computeFeatures(
        normalized.points,
        DEFAULT_EFD_ORDER,
        DEFAULT_EFD_RESAMPLE_POINTS,
        mask,
        width,
        height
      );
      const cnnHandleResolved = await ensureCnnHandle(cnnModelPath);
      let cnnDebug: { sdf: Float32Array; size: number } | undefined;
      if (cnnHandleResolved) {
        const cnnInput = buildCnnInputFromOutlineWithMask(simplified);
        if (cnnInput) {
          const embedding = await runCnnEmbedding(cnnHandleResolved, cnnInput.data, cnnInput.dims);
          features.cnnEmbedding = Array.from(embedding);
          cnnDebug = { sdf: cnnInput.data, size: cnnInput.size };
        }
      }

      postMessage({
        type: 'contour',
        requestId,
        data: {
          points: simplified,
          normalized: normalized.points,
          features,
          cnnDebug
        }
      } satisfies ContourResponse);
    } else if (type === 'match') {
      const { features, prefectures, topN = DEFAULT_TOP_N, weights, cnnModelPath } = e.data;

      if (!features || !prefectures) {
        throw new Error('Features and prefectures data are required');
      }

      postMessage({ type: 'progress', progress: 50, requestId } satisfies ContourResponse);

      const cnnHandleResolved = await ensureCnnHandle(cnnModelPath);
      if (cnnHandleResolved) {
        for (const pref of prefectures) {
          if (pref.features.cnnEmbedding && pref.features.cnnEmbedding.length > 0) {
            continue;
          }
          const cached = prefectureEmbeddingCache.get(pref.code);
          if (cached) {
            pref.features.cnnEmbedding = Array.from(cached);
            continue;
          }
          const cnnInput = buildCnnInputFromOutline(pref.outline);
          if (!cnnInput) continue;
          const embedding = await runCnnEmbedding(cnnHandleResolved, cnnInput.data, cnnInput.dims);
          prefectureEmbeddingCache.set(pref.code, embedding);
          pref.features.cnnEmbedding = Array.from(embedding);
        }
      }

      // Find matches
      const matches = findMatches(
        features,
        prefectures,
        topN,
        weights?.efd,
        weights?.turning,
        weights?.hu,
        weights?.roughness,
        weights?.peak,
        weights?.spread,
        weights?.circularity,
        weights?.convexity,
        weights?.solidity,
        weights?.radialFft,
        weights?.knn,
        weights?.cnn,
        weights?.smoothPenalty,
        weights?.baseSmoothPenalty
      );

      postMessage({
        type: 'matched',
        requestId,
        data: { matches }
      } satisfies ContourResponse);
    }
  } catch (error) {
    postMessage({
      type: 'error',
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    } satisfies ContourResponse);
  }
};
