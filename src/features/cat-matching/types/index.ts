/**
 * アプリケーション共通の型定義
 */

// ===== 基本型 =====

export interface Point {
  x: number;
  y: number;
}

export interface Contour {
  points: Point[];
  area: number;
  perimeter: number;
  isClosed?: boolean;
}

export interface NormalizedContour {
  points: Point[];
  centroid: Point;
  scale: number;
  rotation: number;
}

// ===== 特徴量 =====

export interface EFDFeature {
  coefficients: number[][];
  order: number;
}

export interface TurningFunction {
  values: number[];
  length: number;
}

export interface ContourFeatures {
  efd: number[];
  turning: number[];
  huMoments: number[];
  circularity: number;
  convexity: number;
  solidity: number;
  radialFft: number[];
  knnFeatures?: number[];
  cnnEmbedding?: number[];
}

// ===== KNN標準化 =====

export interface KnnStandardization {
  /** 各次元の平均値 */
  mean: number[];
  /** 各次元の標準偏差 */
  std: number[];
  /** 特徴量の次元数 */
  dimensions: number;
}

// ===== 都道府県データ =====

export interface PrefectureFeature {
  code: string;
  name: string;
  nameEn: string;
  features: ContourFeatures;
  outline: Point[];
}

/** pref_features.json のルート構造（v2以降） */
export interface PrefFeaturesData {
  version: number;
  standardization?: KnnStandardization | null;
  prefectures: PrefectureFeature[];
}

export interface MatchResult {
  prefCode: string;
  name: string;
  nameEn: string;
  score: number;
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
  breakdown: {
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
  };
  align: {
    rotationDeg: number;
    scale: number;
  };
  outline: Point[];
}

// ===== 処理エラー =====

export type ProcessingError =
  | { code: 'MODEL_WORKER_INIT_FAILED'; message: string }
  | { code: 'MODEL_LOAD_FAILED'; message: string }
  | { code: 'PREFECTURE_LOAD_FAILED'; message: string }
  | { code: 'IMAGE_LOAD_FAILED'; message: string }
  | { code: 'CANVAS_INIT_FAILED'; message: string }
  | { code: 'SEGMENTATION_FAILED'; message: string }
  | { code: 'NO_CAT_DETECTED'; message: string }
  | { code: 'CONTOUR_EXTRACTION_FAILED'; message: string }
  | { code: 'MATCHING_FAILED'; message: string }
  | { code: 'PROCESSING_FAILED'; message: string }
  | { code: 'REPROCESS_FAILED'; message: string }
  | { code: 'REMATCH_FAILED'; message: string };

// ===== セグメンテーション =====

export interface SegmentationMask {
  mask: Uint8Array;
  width: number;
  height: number;
}

export interface SegmentationResult extends SegmentationMask {
  confidence: number;
}

// ===== Worker通信（汎用） =====

export interface WorkerMessage {
  type: 'segment' | 'extract-contour' | 'match' | 'progress' | 'error';
  data?: unknown;
  error?: string;
}
