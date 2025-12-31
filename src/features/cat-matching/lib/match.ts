import type { ContourFeatures, PrefectureFeature, MatchResult } from '../types';
import {
  buildKnnFeatures,
  computeSimilarityWithDetails,
  turningRoughness,
  turningStats,
  cyclicL1Distance
} from './descriptors';
import type { SimilarityBreakdown } from './descriptors';
import {
  DEFAULT_TOP_N,
  NORMALIZATION_PERCENTILE,
  SCORE_SMOOTHING_FACTOR,
  WEIGHT_PRESETS
} from './constants';

interface NormalizationFactors {
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

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx] || 1;
}

function computeNormalization(prefectures: PrefectureFeature[]): NormalizationFactors {
  const efdDistances: number[] = [];
  const turningDistances: number[] = [];
  const huDistances: number[] = [];
  const curvatureMeanDistances: number[] = [];
  const curvatureMaxDistances: number[] = [];
  const curvatureStdDistances: number[] = [];
  const circularityDistances: number[] = [];
  const convexityDistances: number[] = [];
  const solidityDistances: number[] = [];
  const radialFftDistances: number[] = [];
  const knnDistances: number[] = [];
  const cnnDistances: number[] = [];

  for (let i = 0; i < prefectures.length; i++) {
    const featureI = prefectures[i].features;
    const roughI = turningRoughness(featureI.turning);
    const statsI = turningStats(featureI.turning);
    const knnI =
      featureI.knnFeatures && featureI.knnFeatures.length > 0
        ? featureI.knnFeatures
        : buildKnnFeatures(featureI);
    for (let j = i + 1; j < prefectures.length; j++) {
      const a = prefectures[i].features;
      const b = prefectures[j].features;
      const knnJ = b.knnFeatures && b.knnFeatures.length > 0 ? b.knnFeatures : buildKnnFeatures(b);

      const efdDist = Math.sqrt(
        a.efd.reduce((sum, v, idx) => sum + Math.pow(v - b.efd[idx], 2), 0)
      );
      const turningDist = cyclicL1Distance(a.turning, b.turning);
      const huDist = Math.sqrt(
        a.huMoments.reduce((sum, v, idx) => sum + Math.pow(v - b.huMoments[idx], 2), 0)
      );
      const roughJ = turningRoughness(prefectures[j].features.turning);
      const roughDist = Math.abs(roughI - roughJ);
      const statsJ = turningStats(prefectures[j].features.turning);
      const peakDist = Math.abs(statsI.maxAbs - statsJ.maxAbs);
      const spreadDist = Math.abs(statsI.stdAbs - statsJ.stdAbs);
      const circularityDist = Math.abs((a.circularity ?? 0) - (b.circularity ?? 0));
      const convexityDist = Math.abs((a.convexity ?? 0) - (b.convexity ?? 0));
      const solidityDist = Math.abs((a.solidity ?? 0) - (b.solidity ?? 0));
      const radialFftDist =
        a.radialFft?.length && b.radialFft?.length
          ? Math.sqrt(
              a.radialFft.reduce((sum, v, idx) => sum + Math.pow(v - b.radialFft[idx], 2), 0)
            )
          : 0;
      const knnDist =
        knnI.length > 0 && knnJ.length > 0 && knnI.length === knnJ.length
          ? Math.sqrt(knnI.reduce((sum, v, idx) => sum + Math.pow(v - knnJ[idx], 2), 0))
          : 0;
      const cnnA = a.cnnEmbedding;
      const cnnB = b.cnnEmbedding;
      let cnnDist = 0;
      if (cnnA && cnnB && cnnA.length > 0 && cnnA.length === cnnB.length) {
        let dot = 0;
        for (let k = 0; k < cnnA.length; k++) {
          dot += cnnA[k] * cnnB[k];
        }
        const similarity = Math.max(-1, Math.min(1, dot));
        cnnDist = 1 - similarity;
      }

      efdDistances.push(efdDist);
      turningDistances.push(turningDist);
      huDistances.push(huDist);
      curvatureMeanDistances.push(roughDist);
      curvatureMaxDistances.push(peakDist);
      curvatureStdDistances.push(spreadDist);
      circularityDistances.push(circularityDist);
      convexityDistances.push(convexityDist);
      solidityDistances.push(solidityDist);
      radialFftDistances.push(radialFftDist);
      knnDistances.push(knnDist);
      if (cnnDist > 0) {
        cnnDistances.push(cnnDist);
      }
    }
  }

  // Use percentile normalization to avoid outlier compression and keep typical distances discriminative
  const norm = {
    efd: percentile(efdDistances, NORMALIZATION_PERCENTILE) || 1,
    turning: percentile(turningDistances, NORMALIZATION_PERCENTILE) || 1,
    hu: percentile(huDistances, NORMALIZATION_PERCENTILE) || 1,
    curvatureMean: percentile(curvatureMeanDistances, NORMALIZATION_PERCENTILE) || 1,
    curvatureMax: percentile(curvatureMaxDistances, NORMALIZATION_PERCENTILE) || 1,
    curvatureStd: percentile(curvatureStdDistances, NORMALIZATION_PERCENTILE) || 1,
    circularity: percentile(circularityDistances, NORMALIZATION_PERCENTILE) || 1,
    convexity: percentile(convexityDistances, NORMALIZATION_PERCENTILE) || 1,
    solidity: percentile(solidityDistances, NORMALIZATION_PERCENTILE) || 1,
    radialFft: percentile(radialFftDistances, NORMALIZATION_PERCENTILE) || 1,
    knn: percentile(knnDistances, NORMALIZATION_PERCENTILE) || 1,
    cnn: percentile(cnnDistances, NORMALIZATION_PERCENTILE) || 1
  };

  return norm;
}

function isCnnOnlyWeights(params: {
  efdWeight: number;
  turningWeight: number;
  huWeight: number;
  roughnessWeight: number;
  peakWeight: number;
  spreadWeight: number;
  circularityWeight: number;
  convexityWeight: number;
  solidityWeight: number;
  radialFftWeight: number;
  knnWeight: number;
  cnnWeight: number;
  smoothPenaltyWeight: number;
  baseSmoothPenaltyWeight: number;
}): boolean {
  return (
    params.efdWeight === 0 &&
    params.turningWeight === 0 &&
    params.huWeight === 0 &&
    params.roughnessWeight === 0 &&
    params.peakWeight === 0 &&
    params.spreadWeight === 0 &&
    params.circularityWeight === 0 &&
    params.convexityWeight === 0 &&
    params.solidityWeight === 0 &&
    params.radialFftWeight === 0 &&
    params.knnWeight === 0 &&
    params.smoothPenaltyWeight === 0 &&
    params.baseSmoothPenaltyWeight === 0 &&
    params.cnnWeight !== 0
  );
}

function computeCnnNormalization(prefectures: PrefectureFeature[]): number {
  const cnnDistances: number[] = [];
  for (let i = 0; i < prefectures.length; i++) {
    const a = prefectures[i].features.cnnEmbedding;
    if (!a || a.length === 0) continue;
    for (let j = i + 1; j < prefectures.length; j++) {
      const b = prefectures[j].features.cnnEmbedding;
      if (!b || b.length === 0 || a.length !== b.length) continue;
      let dot = 0;
      for (let k = 0; k < a.length; k++) {
        dot += a[k] * b[k];
      }
      const similarity = Math.max(-1, Math.min(1, dot));
      const cnnDist = 1 - similarity;
      if (cnnDist > 0) cnnDistances.push(cnnDist);
    }
  }
  return percentile(cnnDistances, NORMALIZATION_PERCENTILE) || 1;
}

function computeCnnOnlyScore(
  features1: ContourFeatures,
  features2: ContourFeatures,
  cnnWeight: number,
  normalizationCnn: number
): { score: number; breakdown: SimilarityBreakdown } {
  const cnn1 = features1.cnnEmbedding;
  const cnn2 = features2.cnnEmbedding;
  const cnnAvailable =
    Array.isArray(cnn1) && Array.isArray(cnn2) && cnn1.length > 0 && cnn1.length === cnn2.length;
  let normalizedCnn = 0;
  if (cnnAvailable) {
    let dot = 0;
    for (let i = 0; i < cnn1.length; i++) {
      dot += cnn1[i] * cnn2[i];
    }
    const similarity = Math.max(-1, Math.min(1, dot));
    const cnnDist = 1 - similarity;
    normalizedCnn = cnnDist / (normalizationCnn || 1);
  }
  const effectiveCnnWeight = cnnAvailable ? cnnWeight : 0;
  const weightedCnn = effectiveCnnWeight * normalizedCnn;
  const score = weightedCnn;

  return {
    score,
    breakdown: {
      weighted: {
        efd: 0,
        turning: 0,
        hu: 0,
        roughness: 0,
        peak: 0,
        spread: 0,
        circularity: 0,
        convexity: 0,
        solidity: 0,
        radialFft: 0,
        knn: 0,
        cnn: weightedCnn,
        smoothPenalty: 0,
        baseSmoothPenalty: 0
      },
      normalized: {
        efd: 0,
        turning: 0,
        hu: 0,
        roughness: 0,
        peak: 0,
        spread: 0,
        circularity: 0,
        convexity: 0,
        solidity: 0,
        radialFft: 0,
        knn: 0,
        cnn: normalizedCnn,
        smoothPenalty: 0,
        baseSmoothPenalty: 0
      },
      weights: {
        efd: 0,
        turning: 0,
        hu: 0,
        roughness: 0,
        peak: 0,
        spread: 0,
        circularity: 0,
        convexity: 0,
        solidity: 0,
        radialFft: 0,
        knn: 0,
        cnn: effectiveCnnWeight,
        smoothPenalty: 0,
        baseSmoothPenalty: 0
      }
    }
  };
}

/**
 * 上位N件のマッチング都道府県を見つける。
 * @param queryFeatures クエリの特徴量
 * @param prefectures 都道府県データリスト
 * @param topN 取得する件数
 * @param efdWeight EFDの重み
 * @param turningWeight Turning Functionの重み
 * @param huWeight Huモーメントの重み
 * @param roughnessWeight 粗さの重み
 * @param peakWeight ピークの重み
 * @param spreadWeight ばらつきの重み
 * @returns マッチング結果のリスト
 */
export function findMatches(
  queryFeatures: ContourFeatures,
  prefectures: PrefectureFeature[],
  topN: number = DEFAULT_TOP_N,
  efdWeight: number = WEIGHT_PRESETS.cnnOnly.efd,
  turningWeight: number = WEIGHT_PRESETS.cnnOnly.turning,
  huWeight: number = WEIGHT_PRESETS.cnnOnly.hu,
  roughnessWeight: number = WEIGHT_PRESETS.cnnOnly.roughness,
  peakWeight: number = WEIGHT_PRESETS.cnnOnly.peak,
  spreadWeight: number = WEIGHT_PRESETS.cnnOnly.spread,
  circularityWeight: number = WEIGHT_PRESETS.cnnOnly.circularity,
  convexityWeight: number = WEIGHT_PRESETS.cnnOnly.convexity,
  solidityWeight: number = WEIGHT_PRESETS.cnnOnly.solidity,
  radialFftWeight: number = WEIGHT_PRESETS.cnnOnly.radialFft,
  knnWeight: number = WEIGHT_PRESETS.cnnOnly.knn,
  cnnWeight: number = WEIGHT_PRESETS.cnnOnly.cnn,
  smoothPenaltyWeight: number = WEIGHT_PRESETS.cnnOnly.smoothPenalty,
  baseSmoothPenaltyWeight: number = WEIGHT_PRESETS.cnnOnly.baseSmoothPenalty
): MatchResult[] {
  const results: MatchResult[] = [];
  const cnnOnly = isCnnOnlyWeights({
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
    baseSmoothPenaltyWeight
  });
  const cnnNormalization = cnnOnly ? computeCnnNormalization(prefectures) : 1;
  const normalization = cnnOnly ? null : computeNormalization(prefectures);

  for (const pref of prefectures) {
    const { score, breakdown } = cnnOnly
      ? computeCnnOnlyScore(queryFeatures, pref.features, cnnWeight, cnnNormalization)
      : computeSimilarityWithDetails(
          queryFeatures,
          pref.features,
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
          normalization || undefined
        );

    results.push({
      prefCode: pref.code,
      name: pref.name,
      nameEn: pref.nameEn,
      score,
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
        cnn: cnnWeight,
        smoothPenalty: smoothPenaltyWeight,
        baseSmoothPenalty: baseSmoothPenaltyWeight
      },
      breakdown,
      align: {
        rotationDeg: 0,
        scale: 1.0
      },
      outline: pref.outline
    });
  }

  // Sort by score (lower is better)
  results.sort((a, b) => a.score - b.score);

  // Return top N
  return results.slice(0, topN);
}

/**
 * スコアを表示用に整形する。
 * @param score 距離スコア
 * @returns 整形されたスコア文字列
 */
export function formatScore(score: number): string {
  // Use a smooth mapping so large distances don't clamp to 0 immediately.
  // Smaller score => higher percentage.
  const pct = 100 / (1 + score * SCORE_SMOOTHING_FACTOR);
  return pct.toFixed(1);
}

/**
 * マッチング結果の説明文を生成する。
 * @param match マッチング結果
 * @returns 説明文
 */
export function getMatchDescription(match: MatchResult): string {
  const { rotationDeg, scale } = match.align;
  const parts: string[] = [];

  if (Math.abs(rotationDeg) > 5) {
    parts.push(`${rotationDeg > 0 ? '+' : ''}${rotationDeg.toFixed(0)}°回転`);
  }

  if (Math.abs(scale - 1.0) > 0.05) {
    const pct = ((scale - 1.0) * 100).toFixed(0);
    parts.push(`${scale > 1.0 ? '拡大' : '縮小'}${Math.abs(parseFloat(pct))}%`);
  }

  if (parts.length === 0) {
    return '';
  }

  return parts.join('・');
}
