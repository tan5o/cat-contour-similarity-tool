export const DEFAULT_TOP_N = 47;
export const DEFAULT_VISIBLE_RESULTS = 10;
export const DEFAULT_MASK_THRESHOLD = 0.5;
// pyefd互換: ノートブックと同じ15次
export const DEFAULT_EFD_ORDER = 15;
export const DEFAULT_TURNING_SAMPLES = 128;
export const DEFAULT_RADIAL_FFT_BINS = 16;
// pyefd互換: ノートブックと同じ128点
export const DEFAULT_EFD_RESAMPLE_POINTS = 128;
export const TURNING_SMOOTH_WINDOW = 9;
export const TURNING_SMOOTH_PASSES = 2;
export const SCORE_SMOOTHING_FACTOR = 1.5;
// 外れ値を除外しつつ識別力を保つための正規化パーセンタイル
export const NORMALIZATION_PERCENTILE = 90;

// 輪郭抽出の閾値
/** 輪郭として認識する最小点数（ノイズ除去用） */
export const MIN_CONTOUR_POINTS = 10;
/** Douglas-Peucker 輪郭簡略化の許容誤差 */
export const CONTOUR_SIMPLIFY_EPSILON = 2.0;
/** 正規化後の輪郭サイズ */
export const NORMALIZED_CONTOUR_SIZE = 128;

/**
 * 開発環境のみでログを出力するユーティリティ
 */
export const debugLog = (...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    console.log('[DEBUG]', ...args);
  }
};

export type WeightConfig = {
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

export const WEIGHT_PRESETS: Record<
  'cnnOnly' | 'baseline' | 'balanced' | 'ibaraki' | 'ibarakiCat' | 'turningFocus',
  WeightConfig
> = {
  cnnOnly: {
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
    cnn: 1.0,
    smoothPenalty: 0,
    baseSmoothPenalty: 0
  },
  baseline: {
    efd: 0.02,
    turning: 0.15,
    hu: 0.08,
    roughness: 0.3,
    peak: 0.25,
    spread: 0.2,
    circularity: 0.0,
    convexity: 0.0,
    solidity: 0.0,
    radialFft: 0.0,
    knn: 0.05,
    cnn: 0.6,
    smoothPenalty: 0.8,
    baseSmoothPenalty: 0.6
  },
  balanced: {
    // 形の全体感を優先しつつ、局所的な尖りを控えめに評価
    efd: 0.08,
    turning: 0.16,
    hu: 0.14,
    roughness: 0.0,
    peak: 0.0,
    spread: 0.0,
    circularity: 0.06,
    convexity: 0.05,
    solidity: 0.0,
    radialFft: 0.1,
    knn: 0.12,
    cnn: 0.7,
    smoothPenalty: 0.8,
    baseSmoothPenalty: 0.6
  },
  ibaraki: {
    // 茨城の縦長・外洋側のうねりを強調した試行プリセット
    efd: 0.05,
    turning: 0.24,
    hu: 0.05,
    roughness: 0.25,
    peak: 0.3,
    spread: 0.13,
    circularity: 0.04,
    convexity: 0.04,
    solidity: 0.05,
    radialFft: 0.18,
    knn: 0.1,
    cnn: 0.6,
    smoothPenalty: 0.8,
    baseSmoothPenalty: 0.6
  },
  ibarakiCat: {
    // 画像の猫シルエット向けに粗さ系を弱め、半径FFTと凸性を強める
    efd: 0.04,
    turning: 0.18,
    hu: 0.03,
    roughness: 0.05,
    peak: 0.08,
    spread: 0.04,
    circularity: 0.08,
    convexity: 0.1,
    solidity: 0.1,
    radialFft: 0.5,
    knn: 0.12,
    cnn: 0.7,
    smoothPenalty: 0.8,
    baseSmoothPenalty: 0.6
  },
  turningFocus: {
    // Turning Function重視：輪郭の角度変化を重視、EFDを低く抑えて局所形状を優先
    efd: 0.03,
    turning: 0.3,
    hu: 0.1,
    roughness: 0.2,
    peak: 0.2,
    spread: 0.17,
    circularity: 0.04,
    convexity: 0.04,
    solidity: 0.04,
    radialFft: 0.08,
    knn: 0.06,
    cnn: 0.6,
    smoothPenalty: 0.8,
    baseSmoothPenalty: 0.6
  }
};

export type WeightPresetKey = keyof typeof WEIGHT_PRESETS;
