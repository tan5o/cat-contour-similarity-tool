import { useCallback, useState } from 'react';
import {
  CanvasPreview,
  Controls,
  ImageDropZone,
  MatchResults,
  useCatProcessing,
  DEFAULT_MASK_THRESHOLD,
  WEIGHT_PRESETS
} from '@/features/cat-matching';
import type { WeightConfig, WeightPresetKey } from '@/features/cat-matching';
import './CatMatchingPage.css';

/**
 * 猫輪郭マッチングの単一ページ。UIとドメインロジックの橋渡しを行う。
 * FSD pages層: Route-levelのページコンポーネント
 */
export function CatMatchingPage() {
  const [maskThreshold, setMaskThreshold] = useState(DEFAULT_MASK_THRESHOLD);
  const [weights, setWeights] = useState<WeightConfig>(WEIGHT_PRESETS.cnnOnly);
  const [weightPreset, setWeightPreset] = useState<WeightPresetKey | 'custom'>('cnnOnly');
  const [opacity, setOpacity] = useState(0.7);
  const [displayMode] = useState<'overlay' | 'cutout'>('overlay');
  const {
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
    modelPromptVisible,
    modelConsentGiven,
    dismissModelPrompt,
    requestModelLoad,
    handleImageSelected,
    notifyResultsRendered
  } = useCatProcessing({ maskThreshold, weights });

  const handleWeightsChange = useCallback((nextWeights: typeof weights) => {
    setWeights(nextWeights);
    setWeightPreset('custom');
  }, []);

  const handleWeightPresetSelect = useCallback((preset: WeightPresetKey) => {
    setWeights(WEIGHT_PRESETS[preset]);
    setWeightPreset(preset);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>猫に似ている都道府県を探すツール</h1>
        <p>猫の輪郭から類似する都道府県を見つけよう</p>
      </header>

      <div className="info-card">
        <strong>判定の仕組み</strong>
        <p>
          猫と都道府県の輪郭を正規化して比較します。CNN埋め込みによる形状類似度を中心にスコア化し、
          数値が小さいほど似ていると判定します。
        </p>
        <div className="privacy-note">
          このアプリはブラウザ内で完結します。画像は外部に送信されません。
        </div>
      </div>

      {modelPromptVisible && (
        <div className="loading-overlay" data-testid="model-prompt">
          <div className="loading model-notice">
            <div className="model-notice-header">
              <h2>モデルのダウンロード前にご確認ください</h2>
              <button
                type="button"
                className="model-notice-close"
                onClick={dismissModelPrompt}
                aria-label="閉じる"
                disabled={loading}
              >
                ×
              </button>
            </div>
            <p>猫の前景抽出とCNN埋め込みに使うモデルを読み込みます。</p>
            <ul className="notice-list">
              <li>
                前景抽出モデル（約4.6MB）とCNN埋め込みモデル（約1.0MB）を一度だけダウンロードし、
                ブラウザに一時保存します。
              </li>
              <li>画像は端末内で処理され、サーバーへ送信されません。</li>
            </ul>

            {error && (
              <div className="notice-error">
                <strong>モデルの読み込みに失敗しました。</strong>
                <br />
                {error.message}
              </div>
            )}

            {loading ? (
              <>
                <div className="loading-spinner"></div>
                <p>モデルを読み込んでいます。通信環境により数秒かかる場合があります。</p>
              </>
            ) : (
              <div className="notice-actions">
                <button onClick={requestModelLoad} data-testid="model-consent-button">
                  {modelConsentGiven
                    ? 'モデルの読み込みを再試行する'
                    : '約5.6MBのモデルをダウンロードして読み込む'}
                </button>
                <p className="notice-sub">
                  許可すると上記モデルのみを取得し、以降の処理はすべてブラウザ内で行います。
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="error">
          <strong>エラー:</strong> {error.message}
          {error.code === 'NO_CAT_DETECTED' && (
            <div className="help-text">
              猫が検出できない場合は、以下をお試しください：
              <ul>
                <li>猫を画面の中心に配置</li>
                <li>背景をシンプルに</li>
                <li>明るい環境で撮影</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="progress-bar" data-testid="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="main-content">
        <div className="section">
          <h2>画像入力</h2>
          <ImageDropZone onImageSelected={handleImageSelected} disabled={loading} />

          {image && (
            <>
              <h2 style={{ marginTop: '2rem' }}>プレビュー</h2>
              <CanvasPreview
                image={image}
                catContour={catContour}
                segmentationMask={segmentationMask}
                opacity={opacity}
                displayMode={displayMode}
              />

              <Controls
                opacity={opacity}
                onOpacityChange={setOpacity}
                maskThreshold={maskThreshold}
                onMaskThresholdChange={setMaskThreshold}
                weights={weights}
                onWeightsChange={handleWeightsChange}
                weightPreset={weightPreset}
                onWeightPresetSelect={handleWeightPresetSelect}
              />
            </>
          )}
        </div>

        <div className="section" data-testid="results-section">
          <h2>結果</h2>
          <MatchResults
            results={results}
            selectedIndex={selectedPrefIndex}
            onSelectResult={setSelectedPrefIndex}
            catContour={catContour}
            cnnDebug={cnnDebug}
            onResultsRendered={notifyResultsRendered}
          />
        </div>
      </div>
    </div>
  );
}
