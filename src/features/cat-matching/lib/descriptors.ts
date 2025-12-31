import type { Point, ContourFeatures } from '../types';
import { DEFAULT_EFD_ORDER, DEFAULT_RADIAL_FFT_BINS, DEFAULT_TURNING_SAMPLES } from './constants';
import { computeEFD, normalizeEFDPyefd } from './efd';
import { computeHuMoments, computeHuMomentsFromMask } from './huMoments';
import { buildKnnFeatures } from './knn';
import { computeRadialFft, convexHull, polygonArea, polygonPerimeter } from './shapeMetrics';
import {
  computeTurningFunction,
  smoothContourForMatching,
  turningRoughness,
  turningStats
} from './turning';
import { cyclicL1Distance, l2Distance } from './distance';

export type { KnnNeighbor, KnnStandardization } from './knn';
export {
  resampleClosed,
  computeEFD,
  normalizeEFDPyefd,
  normalizeEFDCoeffs,
  normalizeEFD
} from './efd';
export { computeHuMoments, computeHuMomentsFromMask } from './huMoments';
export {
  buildKnnFeatures,
  buildKnnFeaturesRaw,
  computeKnnStandardization,
  computePrefectureDistanceMatrix,
  findKNearestFromQuery,
  findKNearestPrefectures
} from './knn';
export { polygonArea, polygonPerimeter, convexHull, computeRadialFft } from './shapeMetrics';
export {
  computeTurningFunction,
  smoothContourForMatching,
  smoothContourForCatDisplay,
  turningRoughness,
  turningStats
} from './turning';
export { l2Distance, l1Distance, cyclicL1Distance } from './distance';

/**
 * 輪郭のすべての特徴量を計算する。
 * @param points 多角形の頂点リスト
 * @param efdOrder EFDの次数
 * @param turningSize Turning Functionのサイズ
 * @returns 輪郭特徴量オブジェクト
 */
export function computeFeatures(
  points: Point[],
  efdOrder: number = DEFAULT_EFD_ORDER,
  turningSize: number = DEFAULT_TURNING_SAMPLES,
  mask?: Uint8Array,
  width?: number,
  height?: number
): ContourFeatures {
  const efdCoeffs = computeEFD(points, efdOrder);
  // pyefd互換: 係数を正規化（振幅ではなく係数そのまま）
  const efd = normalizeEFDPyefd(efdCoeffs);
  const turningPoints = smoothContourForMatching(points);
  const turning = computeTurningFunction(turningPoints, turningSize);
  const huMoments =
    mask && typeof width === 'number' && typeof height === 'number'
      ? computeHuMomentsFromMask(mask, width, height)
      : computeHuMoments(points);
  const area = polygonArea(points);
  const perimeter = polygonPerimeter(points);
  const hull = convexHull(points);
  const hullArea = polygonArea(hull);
  const hullPerimeter = polygonPerimeter(hull);
  const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
  const convexity = perimeter > 0 ? hullPerimeter / perimeter : 0;
  const solidity = hullArea > 0 ? area / hullArea : 0;
  const radialFft = computeRadialFft(points, DEFAULT_RADIAL_FFT_BINS);
  const knnFeatures = buildKnnFeatures({
    efd,
    turning,
    huMoments,
    circularity,
    convexity,
    solidity,
    radialFft
  });

  return { efd, turning, huMoments, circularity, convexity, solidity, radialFft, knnFeatures };
}

/**
 * 結合類似度スコアを計算する。
 * 各距離成分を正規化して結合する。
 * @param features1 特徴量1
 * @param features2 特徴量2
 * @param efdWeight EFDの重み
 * @param turningWeight Turning Functionの重み
 * @param huWeight Huモーメントの重み
 * @param roughnessWeight 粗さの重み
 * @param peakWeight ピークの重み
 * @param spreadWeight ばらつきの重み
 * @param normalization 正規化係数
 * @returns 類似度スコア（低いほど似ている）
 */
export interface SimilarityBreakdown {
  weighted: {
    efd: number;
    turning: number;
    hu: number;
    roughness: number;
    peak: number;
    spread: number;
    circularity: number;
    convexity: number;
    solidity: number;
    radialFft: number;
    knn: number;
    cnn: number;
    smoothPenalty: number;
    baseSmoothPenalty: number;
  };
  normalized: {
    efd: number;
    turning: number;
    hu: number;
    roughness: number;
    peak: number;
    spread: number;
    circularity: number;
    convexity: number;
    solidity: number;
    radialFft: number;
    knn: number;
    cnn: number;
    smoothPenalty: number;
    baseSmoothPenalty: number;
  };
  weights: {
    efd: number;
    turning: number;
    hu: number;
    roughness: number;
    peak: number;
    spread: number;
    circularity: number;
    convexity: number;
    solidity: number;
    radialFft: number;
    knn: number;
    cnn: number;
    smoothPenalty: number;
    baseSmoothPenalty: number;
  };
}

export function computeSimilarityWithDetails(
  features1: ContourFeatures,
  features2: ContourFeatures,
  efdWeight: number = 0.02,
  turningWeight: number = 0.15,
  huWeight: number = 0.08,
  roughnessWeight: number = 0.3,
  peakWeight: number = 0.25,
  spreadWeight: number = 0.2,
  circularityWeight: number = 0.05,
  convexityWeight: number = 0.05,
  solidityWeight: number = 0.05,
  radialFftWeight: number = 0.1,
  knnWeight: number = 0.1,
  cnnWeight: number = 0.6,
  smoothPenaltyWeight: number = 0.8,
  baseSmoothPenaltyWeight: number = 0.6,
  normalization?: {
    efd: number;
    turning: number;
    hu: number;
    curvatureMean: number;
    curvatureMax: number;
    curvatureStd: number;
    circularity: number;
    convexity: number;
    solidity: number;
    radialFft: number;
    knn: number;
    cnn: number;
  }
): { score: number; breakdown: SimilarityBreakdown } {
  const efdDist = l2Distance(features1.efd, features2.efd);
  const turnDist = cyclicL1Distance(features1.turning, features2.turning);
  const huDist = l2Distance(features1.huMoments, features2.huMoments);
  const rough1 = turningRoughness(features1.turning);
  const rough2 = turningRoughness(features2.turning);
  const roughDist = Math.abs(rough1 - rough2);
  const stats1 = turningStats(features1.turning);
  const stats2 = turningStats(features2.turning);
  const peakDist = Math.abs(stats1.maxAbs - stats2.maxAbs);
  const spreadDist = Math.abs(stats1.stdAbs - stats2.stdAbs);
  const circularity1 = Number.isFinite(features1.circularity) ? features1.circularity : 0;
  const circularity2 = Number.isFinite(features2.circularity) ? features2.circularity : 0;
  const convexity1 = Number.isFinite(features1.convexity) ? features1.convexity : 0;
  const convexity2 = Number.isFinite(features2.convexity) ? features2.convexity : 0;
  const solidity1 = Number.isFinite(features1.solidity) ? features1.solidity : 0;
  const solidity2 = Number.isFinite(features2.solidity) ? features2.solidity : 0;
  const radial1 = features1.radialFft ?? [];
  const radial2 = features2.radialFft ?? [];
  const circularityDist = Math.abs(circularity1 - circularity2);
  const convexityDist = Math.abs(convexity1 - convexity2);
  const solidityDist = Math.abs(solidity1 - solidity2);
  const radialFftDist = radial1.length > 0 && radial2.length > 0 ? l2Distance(radial1, radial2) : 0;
  const knn1 =
    features1.knnFeatures && features1.knnFeatures.length > 0
      ? features1.knnFeatures
      : buildKnnFeatures(features1);
  const knn2 =
    features2.knnFeatures && features2.knnFeatures.length > 0
      ? features2.knnFeatures
      : buildKnnFeatures(features2);
  const knnDist =
    knn1.length > 0 && knn2.length > 0 && knn1.length === knn2.length ? l2Distance(knn1, knn2) : 0;
  const cnn1 = features1.cnnEmbedding;
  const cnn2 = features2.cnnEmbedding;
  const cnnAvailable =
    Array.isArray(cnn1) && Array.isArray(cnn2) && cnn1.length > 0 && cnn1.length === cnn2.length;
  let cnnDist = 0;
  if (cnnAvailable) {
    let dot = 0;
    for (let i = 0; i < cnn1.length; i++) {
      dot += cnn1[i] * cnn2[i];
    }
    const similarity = Math.max(-1, Math.min(1, dot));
    cnnDist = 1 - similarity;
  }

  // Normalize distances using provided dataset ranges when available.
  const normalizedEfd = efdDist / (normalization?.efd || 15);
  const normalizedTurn = turnDist / (normalization?.turning || 100);
  const normalizedHu = huDist / (normalization?.hu || 50);
  const normalizedRough = roughDist / (normalization?.curvatureMean || 1);
  const normalizedPeak = Math.min(1.2, peakDist / (normalization?.curvatureMax || 1));
  const normalizedSpread = Math.min(1.2, spreadDist / (normalization?.curvatureStd || 1));
  const normalizedCircularity = circularityDist / (normalization?.circularity || 1);
  const normalizedConvexity = convexityDist / (normalization?.convexity || 1);
  const normalizedSolidity = solidityDist / (normalization?.solidity || 1);
  const normalizedRadialFft = radialFftDist / (normalization?.radialFft || 1);
  const normalizedKnn = knnDist / (normalization?.knn || 1);
  const normalizedCnn = cnnAvailable ? cnnDist / (normalization?.cnn || 1) : 0;

  // Moderated penalties for peak/spread differences (caps avoid distance explosion)
  const peakPenalty = normalizedPeak;
  const spreadPenalty = normalizedSpread;

  // Strong penalty if candidate is smoother (mean/peak/std all notably lower)
  let smoothPenalty = 0;
  const meanDeficit =
    stats2.meanAbs < stats1.meanAbs
      ? (stats1.meanAbs - stats2.meanAbs) / (normalization?.curvatureMean || 1)
      : 0;
  const peakDeficit =
    stats2.maxAbs < stats1.maxAbs
      ? (stats1.maxAbs - stats2.maxAbs) / (normalization?.curvatureMax || 1)
      : 0;
  const spreadDeficit =
    stats2.stdAbs < stats1.stdAbs
      ? (stats1.stdAbs - stats2.stdAbs) / (normalization?.curvatureStd || 1)
      : 0;
  smoothPenalty = Math.min(3, (meanDeficit + peakDeficit + spreadDeficit) * 1.2); // amplify but cap

  // Absolute smoothness bias: if candidate itself is very smooth (low mean/peak/spread), penalize regardless of query
  const baseSmoothPenalty =
    Math.max(0, 0.25 - stats2.meanAbs) +
    Math.max(0, 0.5 - stats2.maxAbs) +
    Math.max(0, 0.15 - stats2.stdAbs);

  const weightedEfd = efdWeight * normalizedEfd;
  const weightedTurning = turningWeight * normalizedTurn;
  const weightedHu = huWeight * normalizedHu;
  const weightedRough = roughnessWeight * normalizedRough;
  const weightedPeak = peakWeight * peakPenalty;
  const weightedSpread = spreadWeight * spreadPenalty;
  const weightedCircularity = circularityWeight * normalizedCircularity;
  const weightedConvexity = convexityWeight * normalizedConvexity;
  const weightedSolidity = solidityWeight * normalizedSolidity;
  const weightedRadialFft = radialFftWeight * normalizedRadialFft;
  const weightedKnn = knnWeight * normalizedKnn;
  const effectiveCnnWeight = cnnAvailable ? cnnWeight : 0;
  const weightedCnn = effectiveCnnWeight * normalizedCnn;
  const weightedSmooth = smoothPenalty * smoothPenaltyWeight;
  const weightedBaseSmooth = baseSmoothPenalty * baseSmoothPenaltyWeight;

  const score =
    weightedEfd +
    weightedTurning +
    weightedHu +
    weightedRough +
    weightedPeak +
    weightedSpread +
    weightedCircularity +
    weightedConvexity +
    weightedSolidity +
    weightedRadialFft +
    weightedKnn +
    weightedCnn +
    weightedSmooth +
    weightedBaseSmooth;

  return {
    score,
    breakdown: {
      weighted: {
        efd: weightedEfd,
        turning: weightedTurning,
        hu: weightedHu,
        roughness: weightedRough,
        peak: weightedPeak,
        spread: weightedSpread,
        circularity: weightedCircularity,
        convexity: weightedConvexity,
        solidity: weightedSolidity,
        radialFft: weightedRadialFft,
        knn: weightedKnn,
        cnn: weightedCnn,
        smoothPenalty: weightedSmooth,
        baseSmoothPenalty: weightedBaseSmooth
      },
      normalized: {
        efd: normalizedEfd,
        turning: normalizedTurn,
        hu: normalizedHu,
        roughness: normalizedRough,
        peak: peakPenalty,
        spread: spreadPenalty,
        circularity: normalizedCircularity,
        convexity: normalizedConvexity,
        solidity: normalizedSolidity,
        radialFft: normalizedRadialFft,
        knn: normalizedKnn,
        cnn: normalizedCnn,
        smoothPenalty: smoothPenalty,
        baseSmoothPenalty
      },
      weights: {
        efd: efdWeight,
        turning: turningWeight,
        hu: huWeight,
        roughness: roughnessWeight,
        peak: peakWeight,
        spread: spreadWeight,
        circularity: circularityWeight,
        convexity: convexityWeight,
        solidity: solidityWeight,
        radialFft: radialFftWeight,
        knn: knnWeight,
        cnn: effectiveCnnWeight,
        smoothPenalty: smoothPenaltyWeight,
        baseSmoothPenalty: baseSmoothPenaltyWeight
      }
    }
  };
}

export function computeSimilarity(
  features1: ContourFeatures,
  features2: ContourFeatures,
  efdWeight?: number,
  turningWeight?: number,
  huWeight?: number,
  roughnessWeight?: number,
  peakWeight?: number,
  spreadWeight?: number,
  circularityWeight?: number,
  convexityWeight?: number,
  solidityWeight?: number,
  radialFftWeight?: number,
  knnWeight?: number,
  cnnWeight?: number,
  smoothPenaltyWeight?: number,
  baseSmoothPenaltyWeight?: number,
  normalization?: {
    efd: number;
    turning: number;
    hu: number;
    curvatureMean: number;
    curvatureMax: number;
    curvatureStd: number;
    circularity: number;
    convexity: number;
    solidity: number;
    radialFft: number;
    knn: number;
    cnn: number;
  }
): number {
  return computeSimilarityWithDetails(
    features1,
    features2,
    efdWeight,
    turningWeight,
    huWeight,
    roughnessWeight,
    peakWeight,
    spreadWeight,
    circularityWeight,
    convexityWeight,
    solidityWeight,
    radialFftWeight,
    knnWeight,
    cnnWeight,
    smoothPenaltyWeight,
    baseSmoothPenaltyWeight,
    normalization
  ).score;
}
