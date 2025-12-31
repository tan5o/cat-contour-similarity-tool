import { useCallback, useRef } from 'react';
import type { PrefectureFeature, KnnStandardization, PrefFeaturesData } from '../types';
import { publicAssetUrl } from '../lib/assets';

export function usePrefectureData() {
  const prefecturesRef = useRef<PrefectureFeature[]>([]);
  const standardizationRef = useRef<KnnStandardization | null>(null);
  const prefectureLoadedRef = useRef(false);

  const loadPrefectureData = useCallback(async () => {
    if (prefectureLoadedRef.current) return prefecturesRef.current;

    const prefUrl = publicAssetUrl('assets/pref_features.json');
    const prefResponse = await fetch(prefUrl);
    if (!prefResponse.ok) {
      throw new Error(`HTTP ${prefResponse.status}: ${prefResponse.statusText}`);
    }
    const json = await prefResponse.json();

    // v2形式（standardization付き）かv1形式（配列のみ）かを判定
    if (Array.isArray(json)) {
      // v1形式: 後方互換性のため
      prefecturesRef.current = json as PrefectureFeature[];
      standardizationRef.current = null;
    } else {
      // v2形式
      const data = json as PrefFeaturesData;
      prefecturesRef.current = data.prefectures;
      standardizationRef.current = data.standardization ?? null;
    }

    prefectureLoadedRef.current = true;
    return prefecturesRef.current;
  }, []);

  return {
    prefecturesRef,
    standardizationRef,
    prefectureLoadedRef,
    loadPrefectureData
  };
}
