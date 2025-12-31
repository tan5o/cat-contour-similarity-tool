import type { WeightConfig, WeightPresetKey } from '../lib/constants';
import './Controls.css';

interface ControlsProps {
  opacity: number;
  onOpacityChange: (value: number) => void;
  maskThreshold: number;
  onMaskThresholdChange: (value: number) => void;
  weights: WeightConfig;
  onWeightsChange: (weights: WeightConfig) => void;
  weightPreset: WeightPresetKey | 'custom';
  onWeightPresetSelect: (preset: WeightPresetKey) => void;
}

/**
 * 表示モード、透明度、マスク閾値を調整するためのコントロールパネルコンポーネント。
 */
export default function Controls({
  opacity,
  onOpacityChange,
  maskThreshold,
  onMaskThresholdChange,
  weights,
  onWeightsChange,
  weightPreset,
  onWeightPresetSelect
}: ControlsProps) {
  const weightSlider = (
    key: keyof typeof weights,
    label: string,
    description: string,
    max: number = 0.6
  ) => (
    <div className="control-group">
      <label htmlFor={`weight-${key}`} className="control-label">
        <span>
          {label}: {weights[key].toFixed(2)}
        </span>
        <span className="control-info" data-tooltip={description} aria-label={description}>
          i
        </span>
      </label>
      <input
        id={`weight-${key}`}
        type="range"
        min="0"
        max={max}
        step="0.01"
        value={weights[key]}
        onChange={e => onWeightsChange({ ...weights, [key]: parseFloat(e.target.value) })}
        className="slider"
      />
    </div>
  );

  return (
    <div className="controls">
      <div className="control-group">
        <label htmlFor="opacity-slider">背景の透明度: {Math.round(opacity * 100)}%</label>
        <input
          id="opacity-slider"
          type="range"
          min="0"
          max="100"
          value={opacity * 100}
          onChange={e => onOpacityChange(parseFloat(e.target.value) / 100)}
          className="slider"
        />
      </div>

      <div className="control-group">
        <label htmlFor="threshold-slider">マスクの閾値: {maskThreshold.toFixed(2)}</label>
        <input
          id="threshold-slider"
          type="range"
          min="0"
          max="100"
          value={maskThreshold * 100}
          onChange={e => onMaskThresholdChange(parseFloat(e.target.value) / 100)}
          className="slider"
        />
      </div>

      {!import.meta.env.PROD && (
        <details className="control-advanced">
          <summary className="control-advanced-summary">高度な設定（スコアの重み）</summary>
          <div className="control-group">
            <label htmlFor="weight-preset-select">重みプリセット:</label>
            <select
              id="weight-preset-select"
              value={weightPreset}
              onChange={e => onWeightPresetSelect(e.target.value as WeightPresetKey)}
              className="select"
            >
              <option value="cnnOnly">CNNのみ（既定）</option>
              <option value="balanced">バランス調整（おすすめ）</option>
              <option value="turningFocus">Turning重視（輪郭の角度変化優先）</option>
              <option value="baseline">バックアップ（従来の初期値）</option>
              <option value="ibaraki">茨城寄りプリセット（試行）</option>
              <option value="ibarakiCat">茨城猫プリセット（今回の画像向け）</option>
              <option value="custom" disabled>
                カスタム（スライダー調整中）
              </option>
            </select>
          </div>
          {weightSlider(
            'efd',
            'EFDの重み',
            '輪郭の全体形状をフーリエで表現した特徴。大域的な形の一致を重視。',
            0.2
          )}
          {weightSlider(
            'turning',
            'Turningの重み',
            '輪郭をなぞったときの向きの変化。曲がり方の一致を重視。',
            0.4
          )}
          {weightSlider(
            'hu',
            'Huの重み',
            '領域モーメント由来の不変量。全体のバランスや塊感を重視。',
            0.3
          )}
          {weightSlider(
            'roughness',
            '粗さの重み',
            '曲がりの荒さ（ギザギザ感）。小さいほど滑らか。',
            0.6
          )}
          {weightSlider('peak', 'ピーク差の重み', '曲がりの最大値の差。尖りの強さに敏感。', 0.6)}
          {weightSlider(
            'spread',
            'ばらつき差の重み',
            '曲がりの分散（ばらつき）。均一さの差に敏感。',
            0.6
          )}
          {weightSlider(
            'circularity',
            'Circularityの重み',
            '面積と周長から算出する丸さ指標（1に近いほど丸い）。',
            0.3
          )}
          {weightSlider('convexity', 'Convexityの重み', '凸包周長/周長。凹凸の少なさを評価。', 0.3)}
          {weightSlider('solidity', 'Solidityの重み', '面積/凸包面積。凹みの多さに敏感。', 0.3)}
          {weightSlider(
            'radialFft',
            '半径FFTの重み',
            '重心からの距離の周波数成分。張り出し方の一致を重視。',
            0.4
          )}
          {weightSlider(
            'knn',
            'KNNの重み',
            '複数特徴量を連結したベクトルの距離。全体の近さをまとめて評価。',
            0.4
          )}
          {weightSlider(
            'cnn',
            'CNN埋め込みの重み',
            '距離学習済みCNNの埋め込み距離。学習した形状類似を重視。',
            1.2
          )}
          {weights.smoothPenalty > 0 &&
            weightSlider(
              'smoothPenalty',
              '滑らかさ補正の重み',
              '候補が猫より滑らかすぎる場合の補正。',
              1.2
            )}
          {weights.baseSmoothPenalty > 0 &&
            weightSlider(
              'baseSmoothPenalty',
              '基準滑らかさの重み',
              '候補自体が極端に滑らかな場合の補正。',
              1.2
            )}
        </details>
      )}
    </div>
  );
}
