/**
 * features/cat-matching - 猫輪郭マッチング機能
 *
 * FSD features層: ユーザー操作単位の機能モジュール
 * - 画像投入 → 推論 → 結果反映 のフロー
 * - UI部品（CanvasPreview, Controls等）はドメイン知識を持つ
 * - 汎用UI（Button等）は shared/ui に配置
 */

// Components (ドメイン知識を持つUI部品)
export { default as CanvasPreview } from './components/CanvasPreview';
export { default as Controls } from './components/Controls';
export { default as ImageDropZone } from './components/ImageDropZone';
export { default as MatchResults } from './components/MatchResults';

// Hooks
export { useCatProcessing } from './hooks/useCatProcessing';
export { usePrefectureData } from './hooks/usePrefectureData';

// Lib (KNN関連)
export {
  findKNearestPrefectures,
  findKNearestFromQuery,
  computePrefectureDistanceMatrix,
  buildKnnFeatures,
  computeKnnStandardization
} from './lib/descriptors';
export type { KnnNeighbor, KnnStandardization } from './lib/descriptors';

// Constants & Types
export { DEFAULT_MASK_THRESHOLD, DEFAULT_TOP_N, WEIGHT_PRESETS } from './lib/constants';
export type { WeightConfig, WeightPresetKey } from './lib/constants';

// Types
export type * from './types';
