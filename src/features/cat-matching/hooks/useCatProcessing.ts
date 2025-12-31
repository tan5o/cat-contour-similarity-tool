import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ContourFeatures,
  MatchResult,
  Point,
  ProcessingError,
  SegmentationMask
} from '../types';
import { DEFAULT_MASK_THRESHOLD, DEFAULT_TOP_N } from '../lib/constants';
import type { WeightConfig } from '../lib/constants';
import { publicAssetUrl } from '../lib/assets';
import { usePrefectureData } from './usePrefectureData';
import { useWorkerMessaging } from './useWorkerMessaging';

type PreviewImageSource = HTMLCanvasElement | HTMLImageElement;

interface UseCatProcessingOptions {
  maskThreshold?: number;
  weights: WeightConfig;
  topN?: number;
}

export function useCatProcessing(options: UseCatProcessingOptions) {
  const { maskThreshold = DEFAULT_MASK_THRESHOLD, weights, topN = DEFAULT_TOP_N } = options;

  const [image, setImage] = useState<PreviewImageSource | null>(null);
  const [catContour, setCatContour] = useState<Point[]>([]);
  const [segmentationMask, setSegmentationMask] = useState<SegmentationMask | null>(null);
  const [cnnDebug, setCnnDebug] = useState<{ sdf: Float32Array; size: number } | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [selectedPrefIndex, setSelectedPrefIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<ProcessingError | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelConsentGiven, setModelConsentGiven] = useState(false);
  const [modelPromptVisible, setModelPromptVisible] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const {
    segmentWorkerRef,
    contourWorkerRef,
    segmentHandlersRef,
    contourHandlersRef,
    sendWorkerMessage
  } = useWorkerMessaging();
  const runIdRef = useRef(0);
  const pendingCompletionRef = useRef<number | null>(null);
  const weightsRef = useRef(weights);
  const maskThresholdRef = useRef(maskThreshold);
  const { prefecturesRef, prefectureLoadedRef, loadPrefectureData } = usePrefectureData();
  const currentImageDataRef = useRef<ImageData | null>(null);
  const catFeaturesRef = useRef<ContourFeatures | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const nextRunId = useCallback(() => {
    runIdRef.current += 1;
    return runIdRef.current;
  }, []);
  const isRunCurrent = useCallback((runId: number) => runId === runIdRef.current, []);
  const notifyResultsRendered = useCallback(() => {
    const runId = pendingCompletionRef.current;
    if (!runId || !isRunCurrent(runId)) return;
    requestAnimationFrame(() => {
      if (!isRunCurrent(runId)) return;
      if (pendingCompletionRef.current !== runId) return;
      setProgress(100);
      setLoading(false);
      pendingCompletionRef.current = null;
    });
  }, [isRunCurrent]);

  const startNewAbortController = useCallback(() => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return controller;
  }, []);

  const isAbortError = useCallback(
    (err: unknown): boolean => err instanceof DOMException && err.name === 'AbortError',
    []
  );

  const toProcessingError = useCallback(
    (code: ProcessingError['code'], message: string): ProcessingError => ({ code, message }),
    []
  );

  const isProcessingError = useCallback((err: unknown): err is ProcessingError => {
    return typeof err === 'object' && err !== null && 'code' in err && 'message' in err;
  }, []);

  const normalizeWorkerError = useCallback(
    (message: string): ProcessingError => {
      if (message.toLowerCase().includes('no contours')) {
        return toProcessingError('NO_CAT_DETECTED', '猫が検出できませんでした');
      }
      return toProcessingError('PROCESSING_FAILED', message);
    },
    [toProcessingError]
  );

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const resetState = () => {
    setResults([]);
    setCatContour([]);
    setSegmentationMask(null);
    setCnnDebug(null);
    setSelectedPrefIndex(0);
    setError(null);
    catFeaturesRef.current = null;
  };

  const requestModelLoad = useCallback(async () => {
    if (!segmentWorkerRef.current) {
      setError(
        toProcessingError('MODEL_WORKER_INIT_FAILED', 'モデルワーカーの初期化に失敗しました')
      );
      return;
    }

    if (loading) return;
    if (modelLoaded) {
      setModelPromptVisible(false);
      return;
    }

    setModelConsentGiven(true);
    setModelPromptVisible(true);

    setError(null);
    setLoading(true);
    setProgress(0);

    try {
      await sendWorkerMessage(
        segmentWorkerRef,
        segmentHandlersRef,
        {
          type: 'load',
          modelPath: publicAssetUrl('assets/models/u2netp.onnx')
        },
        p => setProgress(Math.min(100, p))
      );
      setModelLoaded(true);
      setModelPromptVisible(false);
      try {
        await loadPrefectureData();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '都道府県データの読み込みに失敗しました';
        setError(toProcessingError('PREFECTURE_LOAD_FAILED', message));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'モデルの読み込みに失敗しました';
      setError(toProcessingError('MODEL_LOAD_FAILED', message));
    } finally {
      setLoading(false);
    }
  }, [
    loadPrefectureData,
    loading,
    modelLoaded,
    sendWorkerMessage,
    segmentWorkerRef,
    segmentHandlersRef,
    toProcessingError
  ]);

  const dismissModelPrompt = useCallback(() => {
    if (loading) return;
    setModelPromptVisible(false);
  }, [loading]);

  const runSegmentation = useCallback(
    async (imageData: ImageData, runId: number, signal: AbortSignal, threshold?: number) => {
      const response = await sendWorkerMessage(
        segmentWorkerRef,
        segmentHandlersRef,
        {
          type: 'segment',
          imageData,
          threshold: threshold ?? maskThresholdRef.current
        },
        p => {
          if (isRunCurrent(runId) && !signal.aborted) {
            setProgress(Math.min(40, p));
          }
        }
      );

      if (!response.data) {
        throw toProcessingError('SEGMENTATION_FAILED', 'セグメンテーション結果が空です');
      }

      if (!isRunCurrent(runId) || signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const segmentData = response.data as { mask: Uint8Array; width: number; height: number };
      setSegmentationMask({
        mask: segmentData.mask,
        width: segmentData.width,
        height: segmentData.height
      });

      return segmentData;
    },
    [sendWorkerMessage, isRunCurrent, toProcessingError]
  );

  const processContour = useCallback(
    async (
      maskData: { mask: Uint8Array; width: number; height: number },
      runId: number,
      signal: AbortSignal
    ) => {
      const response = await sendWorkerMessage(
        contourWorkerRef,
        contourHandlersRef,
        {
          type: 'process',
          mask: maskData.mask,
          width: maskData.width,
          height: maskData.height,
          cnnModelPath: publicAssetUrl('assets/models/shape_cnn_64x64.onnx')
        },
        p => {
          if (isRunCurrent(runId) && !signal.aborted) {
            setProgress(40 + p * 0.5);
          }
        }
      );

      if (!response.data) {
        throw toProcessingError('CONTOUR_EXTRACTION_FAILED', '輪郭の抽出に失敗しました');
      }

      if (!isRunCurrent(runId) || signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const contourData = response.data as {
        points: Point[];
        features: ContourFeatures;
        cnnDebug?: { sdf: Float32Array; size: number };
      };
      setCatContour(contourData.points);
      catFeaturesRef.current = contourData.features;
      setCnnDebug(contourData.cnnDebug ?? null);
      return contourData;
    },
    [sendWorkerMessage, isRunCurrent, toProcessingError]
  );

  const matchPrefectures = useCallback(
    async (
      features: ContourFeatures,
      weightConfig: WeightConfig,
      runId: number,
      signal: AbortSignal
    ) => {
      if (!prefectureLoadedRef.current) {
        try {
          await loadPrefectureData();
        } catch (err) {
          const message =
            err instanceof Error ? err.message : '都道府県データの読み込みに失敗しました';
          throw toProcessingError('PREFECTURE_LOAD_FAILED', message);
        }
      }

      const response = await sendWorkerMessage(
        contourWorkerRef,
        contourHandlersRef,
        {
          type: 'match',
          features,
          prefectures: prefecturesRef.current,
          topN,
          weights: weightConfig,
          cnnModelPath: publicAssetUrl('assets/models/shape_cnn_64x64.onnx')
        },
        p => {
          if (isRunCurrent(runId) && !signal.aborted) {
            setProgress(60 + p * 0.4);
          }
        }
      );

      if (!response.data) {
        throw toProcessingError('MATCHING_FAILED', 'マッチングに失敗しました');
      }

      if (!isRunCurrent(runId) || signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const matchData = response.data as { matches: MatchResult[] };
      setResults(matchData.matches);
      setSelectedPrefIndex(0);
      pendingCompletionRef.current = runId;
    },
    [
      loadPrefectureData,
      sendWorkerMessage,
      topN,
      isRunCurrent,
      prefectureLoadedRef,
      toProcessingError
    ]
  );

  const runPipeline = useCallback(
    (file: File) => {
      const runId = nextRunId();
      const controller = startNewAbortController();
      const { signal } = controller;
      resetState();
      setLoading(true);
      setProgress(0);

      const img = new Image();
      const url = URL.createObjectURL(file);

      const handleAbort = () => {
        img.onload = null;
        img.onerror = null;
        URL.revokeObjectURL(url);
      };

      signal.addEventListener('abort', handleAbort, { once: true });

      img.onload = async () => {
        URL.revokeObjectURL(url);
        if (!isRunCurrent(runId) || signal.aborted) return;

        const maxEdge = 1024;
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = Math.max(1, Math.round(img.width * scale));
        previewCanvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = previewCanvas.getContext('2d');
        if (!ctx) {
          setError(toProcessingError('CANVAS_INIT_FAILED', 'Canvasの初期化に失敗しました'));
          setLoading(false);
          return;
        }

        ctx.drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height);
        const imageData = ctx.getImageData(0, 0, previewCanvas.width, previewCanvas.height);
        currentImageDataRef.current = imageData;
        setImage(previewCanvas);

        try {
          const segmented = await runSegmentation(
            imageData,
            runId,
            signal,
            maskThresholdRef.current
          );
          if (isRunCurrent(runId) && !signal.aborted) setProgress(50);
          const contour = await processContour(segmented, runId, signal);
          await matchPrefectures(contour.features, weightsRef.current, runId, signal);
        } catch (err) {
          if (isRunCurrent(runId) && !signal.aborted) {
            if (isAbortError(err)) return;
            if (isProcessingError(err)) {
              setError(err);
              return;
            }
            const message = err instanceof Error ? err.message : '処理中にエラーが発生しました';
            setError(normalizeWorkerError(message));
          }
        } finally {
          if (isRunCurrent(runId) && !signal.aborted) {
            if (pendingCompletionRef.current !== runId) {
              setLoading(false);
            }
          }
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        if (isRunCurrent(runId) && !signal.aborted) {
          setError(toProcessingError('IMAGE_LOAD_FAILED', '画像の読み込みに失敗しました'));
          setLoading(false);
        }
      };

      img.src = url;
    },
    [
      matchPrefectures,
      processContour,
      runSegmentation,
      isRunCurrent,
      nextRunId,
      startNewAbortController,
      toProcessingError,
      normalizeWorkerError,
      isAbortError,
      isProcessingError
    ]
  );

  const handleImageSelected = useCallback(
    (file: File) => {
      abortControllerRef.current?.abort();
      if (!modelLoaded) {
        setPendingFile(file);
        setModelPromptVisible(true);
        setError(null);
        return;
      }

      runPipeline(file);
    },
    [modelLoaded, runPipeline]
  );

  useEffect(() => {
    if (modelLoaded && pendingFile) {
      runPipeline(pendingFile);
      setPendingFile(null);
      setModelPromptVisible(false);
    }
  }, [modelLoaded, pendingFile, runPipeline]);

  // weightsRef を最新に保つ
  useEffect(() => {
    weightsRef.current = weights;
  }, [weights]);

  // maskThresholdRef を最新に保つ
  useEffect(() => {
    maskThresholdRef.current = maskThreshold;
  }, [maskThreshold]);

  // maskThreshold 変更時: セグメンテーションから再実行
  useEffect(() => {
    if (!currentImageDataRef.current || !modelLoaded) return;

    // 初回ロード時はスキップ（runPipeline が処理する）
    // maskThreshold が変更されたときだけ再セグメンテーション
    const runId = nextRunId();
    const controller = startNewAbortController();
    const { signal } = controller;

    const reprocess = async () => {
      setLoading(true);
      setProgress(10);
      setResults([]);
      setCatContour([]);
      setSegmentationMask(null);
      catFeaturesRef.current = null;

      try {
        const segmented = await runSegmentation(
          currentImageDataRef.current!,
          runId,
          signal,
          maskThreshold
        );
        if (!isRunCurrent(runId) || signal.aborted) return;

        const contour = await processContour(segmented, runId, signal);
        if (!isRunCurrent(runId) || signal.aborted) return;

        await matchPrefectures(contour.features, weightsRef.current, runId, signal);
      } catch (err) {
        if (isRunCurrent(runId) && !signal.aborted) {
          if (isAbortError(err)) return;
          if (isProcessingError(err)) {
            setError(err);
            return;
          }
          const message = err instanceof Error ? err.message : '閾値変更時にエラーが発生しました';
          setError(toProcessingError('REPROCESS_FAILED', message));
        }
      } finally {
        if (isRunCurrent(runId) && !signal.aborted) {
          if (pendingCompletionRef.current !== runId) {
            setLoading(false);
          }
        }
      }
    };

    reprocess();
  }, [
    maskThreshold,
    modelLoaded,
    matchPrefectures,
    nextRunId,
    processContour,
    runSegmentation,
    isRunCurrent,
    startNewAbortController,
    isAbortError,
    isProcessingError,
    toProcessingError
  ]);

  // weights 変更時: マッチングのみ再実行（セグメンテーション・輪郭抽出はスキップ）
  useEffect(() => {
    if (!catFeaturesRef.current || !modelLoaded) return;
    const runId = nextRunId();
    const controller = startNewAbortController();
    const { signal } = controller;

    const rematch = async () => {
      setLoading(true);
      setProgress(60);

      try {
        await matchPrefectures(catFeaturesRef.current!, weights, runId, signal);
      } catch (err) {
        if (isRunCurrent(runId) && !signal.aborted) {
          if (isAbortError(err)) return;
          if (isProcessingError(err)) {
            setError(err);
            return;
          }
          const message = err instanceof Error ? err.message : '再計算に失敗しました';
          setError(toProcessingError('REMATCH_FAILED', message));
        }
      } finally {
        if (isRunCurrent(runId) && !signal.aborted) {
          if (pendingCompletionRef.current !== runId) {
            setLoading(false);
          }
        }
      }
    };

    rematch();
  }, [
    weights,
    modelLoaded,
    matchPrefectures,
    nextRunId,
    isRunCurrent,
    startNewAbortController,
    isAbortError,
    isProcessingError,
    toProcessingError
  ]);

  return {
    image,
    catContour,
    segmentationMask,
    cnnDebug,
    results,
    selectedPrefIndex,
    setSelectedPrefIndex,
    loading,
    progress,
    error,
    modelLoaded,
    modelPromptVisible,
    modelConsentGiven,
    dismissModelPrompt,
    requestModelLoad,
    handleImageSelected,
    notifyResultsRendered
  };
}
