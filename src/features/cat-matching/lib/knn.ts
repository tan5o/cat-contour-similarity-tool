import type { ContourFeatures } from '../types';
import { l2Distance } from './distance';

/**
 * KNN特徴量の標準化に使用する統計量
 */
export interface KnnStandardization {
  /** 各次元の平均値 */
  mean: number[];
  /** 各次元の標準偏差 */
  std: number[];
  /** 特徴量の次元数 */
  dimensions: number;
}

/**
 * 複数の特徴量セットから標準化用の統計量を計算する。
 * @param allFeatures 全都道府県の特徴量配列
 * @returns 標準化用の平均と標準偏差
 */
export function computeKnnStandardization(
  allFeatures: Array<{
    efd: number[];
    turning: number[];
    huMoments: number[];
    circularity: number;
    convexity: number;
    solidity: number;
    radialFft: number[];
  }>
): KnnStandardization {
  if (allFeatures.length === 0) {
    return { mean: [], std: [], dimensions: 0 };
  }

  // まず生の特徴量ベクトルを構築
  const rawVectors = allFeatures.map(f => buildKnnFeaturesRaw(f));
  const dimensions = rawVectors[0].length;
  const n = rawVectors.length;

  // 各次元の平均を計算
  const mean = new Array(dimensions).fill(0);
  for (const vec of rawVectors) {
    for (let i = 0; i < dimensions; i++) {
      mean[i] += vec[i];
    }
  }
  for (let i = 0; i < dimensions; i++) {
    mean[i] /= n;
  }

  // 各次元の標準偏差を計算
  const std = new Array(dimensions).fill(0);
  for (const vec of rawVectors) {
    for (let i = 0; i < dimensions; i++) {
      const diff = vec[i] - mean[i];
      std[i] += diff * diff;
    }
  }
  for (let i = 0; i < dimensions; i++) {
    std[i] = Math.sqrt(std[i] / n);
    // 標準偏差が0の場合は1にして除算エラーを防ぐ
    if (std[i] < 1e-10) std[i] = 1;
  }

  return { mean, std, dimensions };
}

/**
 * KNN向けの生の特徴量ベクトルを構築する（標準化前）。
 * Turning Functionは0リベースしてπで正規化する。
 */
export function buildKnnFeaturesRaw(input: {
  efd: number[];
  turning: number[];
  huMoments: number[];
  circularity: number;
  convexity: number;
  solidity: number;
  radialFft: number[];
}): number[] {
  const turning = input.turning;
  const turningBase = turning.length > 0 ? turning[0] : 0;
  const normalizedTurning = turning.map(v => (v - turningBase) / Math.PI);
  const circularity = Number.isFinite(input.circularity) ? input.circularity : 0;
  const convexity = Number.isFinite(input.convexity) ? input.convexity : 0;
  const solidity = Number.isFinite(input.solidity) ? input.solidity : 0;

  return [
    ...input.efd,
    ...normalizedTurning,
    ...input.huMoments,
    circularity,
    convexity,
    solidity,
    ...input.radialFft
  ];
}

/**
 * KNN向けの特徴量ベクトルを構築する。
 * standardizationが提供された場合は標準化（平均0、標準偏差1）を適用。
 * @param input 特徴量
 * @param standardization 標準化用の統計量（オプション）
 * @returns 特徴量ベクトル
 */
export function buildKnnFeatures(
  input: {
    efd: number[];
    turning: number[];
    huMoments: number[];
    circularity: number;
    convexity: number;
    solidity: number;
    radialFft: number[];
  },
  standardization?: KnnStandardization
): number[] {
  const raw = buildKnnFeaturesRaw(input);

  if (!standardization || standardization.mean.length !== raw.length) {
    return raw;
  }

  // 標準化: (x - mean) / std
  return raw.map((v, i) => (v - standardization.mean[i]) / standardization.std[i]);
}

// ===== KNN検索API =====

/**
 * KNN検索の結果
 */
export interface KnnNeighbor {
  /** 都道府県コード */
  code: string;
  /** 都道府県名 */
  name: string;
  /** L2距離（標準化済み特徴量空間） */
  distance: number;
}

/**
 * 47都道府県から指定都道府県のK近傍を検索する。
 * @param targetCode 対象の都道府県コード
 * @param prefectures 全都道府県データ
 * @param k 取得する近傍数（デフォルト: 5）
 * @returns 近傍の都道府県リスト（距離昇順）
 */
export function findKNearestPrefectures(
  targetCode: string,
  prefectures: Array<{ code: string; name: string; features: ContourFeatures }>,
  k: number = 5
): KnnNeighbor[] {
  const target = prefectures.find(p => p.code === targetCode);
  if (!target) {
    throw new Error(`Prefecture not found: ${targetCode}`);
  }

  const targetKnn = target.features.knnFeatures;
  if (!targetKnn || targetKnn.length === 0) {
    throw new Error(`KNN features not available for: ${targetCode}`);
  }

  const distances: KnnNeighbor[] = [];

  for (const pref of prefectures) {
    if (pref.code === targetCode) continue;

    const knn = pref.features.knnFeatures;
    if (!knn || knn.length !== targetKnn.length) continue;

    const distance = l2Distance(targetKnn, knn);
    distances.push({
      code: pref.code,
      name: pref.name,
      distance
    });
  }

  // 距離昇順でソートしてK件返す
  distances.sort((a, b) => a.distance - b.distance);
  return distances.slice(0, k);
}

/**
 * クエリ特徴量からK近傍の都道府県を検索する。
 * @param queryFeatures クエリの特徴量
 * @param prefectures 全都道府県データ
 * @param standardization 標準化用の統計量（オプション）
 * @param k 取得する近傍数（デフォルト: 5）
 * @returns 近傍の都道府県リスト（距離昇順）
 */
export function findKNearestFromQuery(
  queryFeatures: ContourFeatures,
  prefectures: Array<{ code: string; name: string; features: ContourFeatures }>,
  standardization?: KnnStandardization,
  k: number = 5
): KnnNeighbor[] {
  const queryKnn = buildKnnFeatures(queryFeatures, standardization);

  const distances: KnnNeighbor[] = [];

  for (const pref of prefectures) {
    const knn = pref.features.knnFeatures;
    if (!knn || knn.length !== queryKnn.length) continue;

    const distance = l2Distance(queryKnn, knn);
    distances.push({
      code: pref.code,
      name: pref.name,
      distance
    });
  }

  // 距離昇順でソートしてK件返す
  distances.sort((a, b) => a.distance - b.distance);
  return distances.slice(0, k);
}

/**
 * 全都道府県間の距離行列を計算する。
 * @param prefectures 全都道府県データ
 * @returns 距離行列（47x47、対角は0）
 */
export function computePrefectureDistanceMatrix(
  prefectures: Array<{ code: string; name: string; features: ContourFeatures }>
): { codes: string[]; names: string[]; distances: number[][] } {
  const n = prefectures.length;
  const codes = prefectures.map(p => p.code);
  const names = prefectures.map(p => p.name);
  const distances: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    const knnI = prefectures[i].features.knnFeatures;
    if (!knnI || knnI.length === 0) continue;

    for (let j = i + 1; j < n; j++) {
      const knnJ = prefectures[j].features.knnFeatures;
      if (!knnJ || knnJ.length !== knnI.length) continue;

      const dist = l2Distance(knnI, knnJ);
      distances[i][j] = dist;
      distances[j][i] = dist;
    }
  }

  return { codes, names, distances };
}
