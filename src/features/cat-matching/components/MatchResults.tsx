import type { MatchResult } from '../types';
import { getMatchDescription } from '../lib/match';
import './MatchResults.css';
import { useEffect, useRef, useState } from 'react';
import type { Point } from '../types';
import { DEFAULT_VISIBLE_RESULTS } from '../lib/constants';

interface MatchResultsProps {
  results: MatchResult[];
  selectedIndex: number;
  onSelectResult: (index: number) => void;
  catContour?: Point[];
  cnnDebug?: { sdf: Float32Array; size: number } | null;
  onResultsRendered?: () => void;
}

const outlinePathCache = new Map<string, string>();

function pointsToPath(points: Point[]): string {
  const sanitized = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (sanitized.length === 0) return '';
  const round = (value: number) => Math.round(value * 10000) / 10000;
  const path: string[] = [];
  path.push(`M ${round(sanitized[0].x)} ${round(sanitized[0].y)}`);
  for (let i = 1; i < sanitized.length; i++) {
    path.push(`L ${round(sanitized[i].x)} ${round(sanitized[i].y)}`);
  }
  if (shouldClosePath(sanitized)) {
    path.push('Z');
  }
  return path.join(' ');
}

function shouldClosePath(points: Point[]): boolean {
  if (points.length < 3) return false;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  const avg = total / Math.max(1, points.length - 1);
  const closeThreshold = Math.max(1, avg * 3);
  const dxEnd = points[0].x - points[points.length - 1].x;
  const dyEnd = points[0].y - points[points.length - 1].y;
  const endDist = Math.sqrt(dxEnd * dxEnd + dyEnd * dyEnd);
  return endDist <= closeThreshold;
}

function getBounds(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

/**
 * 解析結果（類似する都道府県のリスト）を表示するコンポーネント。
 */
export default function MatchResults({
  results,
  selectedIndex,
  onSelectResult,
  catContour,
  cnnDebug,
  onResultsRendered
}: MatchResultsProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [previewPaths, setPreviewPaths] = useState<Record<string, string>>({});
  const cnnCanvasRef = useRef<HTMLCanvasElement>(null);
  const visibleResults = showAll
    ? results.map((result, index) => ({ result, index }))
    : results.slice(0, DEFAULT_VISIBLE_RESULTS).map((result, index) => ({ result, index }));
  const catPath = catContour && catContour.length > 0 ? pointsToPath(catContour) : '';
  const catBounds = catContour && catContour.length > 0 ? getBounds(catContour) : null;
  const catPadding = catBounds ? Math.max(catBounds.width, catBounds.height) * 0.08 : 0;
  const catViewBox = catBounds
    ? `${catBounds.minX - catPadding} ${catBounds.minY - catPadding} ${catBounds.width + catPadding * 2} ${catBounds.height + catPadding * 2}`
    : '0 0 1 1';

  useEffect(() => {
    if (visibleResults.length === 0) return;
    const missing = visibleResults.filter(({ result }) => {
      return !previewPaths[result.prefCode] && !outlinePathCache.has(result.prefCode);
    });
    if (missing.length === 0) return;

    let cancelled = false;
    let timeoutId: number | null = null;
    let index = 0;

    const processNext = () => {
      if (cancelled) return;
      const item = missing[index++];
      if (!item) return;
      const path = pointsToPath(item.result.outline);
      outlinePathCache.set(item.result.prefCode, path);
      setPreviewPaths(prev =>
        prev[item.result.prefCode] ? prev : { ...prev, [item.result.prefCode]: path }
      );
      if (index < missing.length) {
        timeoutId = window.setTimeout(processNext, 0);
      }
    };

    timeoutId = window.setTimeout(processNext, 0);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [previewPaths, visibleResults]);

  useEffect(() => {
    if (results.length === 0) return;
    onResultsRendered?.();
  }, [onResultsRendered, results]);

  useEffect(() => {
    const canvas = cnnCanvasRef.current;
    if (!canvas || !cnnDebug) return;
    const size = Math.max(1, cnnDebug.size);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;
    const imageData = ctx.createImageData(size, size);
    for (let i = 0; i < cnnDebug.sdf.length; i++) {
      const value = cnnDebug.sdf[i];
      const normalized = Math.max(-1, Math.min(1, value));
      const gray = Math.round((normalized + 1) * 127.5);
      const idx = i * 4;
      imageData.data[idx] = gray;
      imageData.data[idx + 1] = gray;
      imageData.data[idx + 2] = gray;
      imageData.data[idx + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }, [cnnDebug, expandedIndex, selectedIndex]);

  if (results.length === 0) {
    return (
      <div className="result-list-empty" data-testid="match-results-empty">
        <p>解析結果がここに表示されます</p>
      </div>
    );
  }

  return (
    <div className="result-list" data-testid="match-results">
      <h3 className="result-list-title">類似する都道府県 Top {results.length}</h3>
      {catPath && (
        <div className="result-cat-shape">
          <div className="result-cat-title">あなたの猫の形</div>
          <div className="result-cat-preview">
            <svg
              className="result-cat-image"
              viewBox={catViewBox}
              preserveAspectRatio="xMidYMid meet"
              aria-label="あなたの猫の形"
              role="img"
            >
              <path d={catPath} />
            </svg>
          </div>
        </div>
      )}
      {visibleResults.map(({ result, index }) => {
        const description = getMatchDescription(result);
        return (
          <div
            key={result.prefCode}
            className={`result-item ${index === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelectResult(index)}
          >
            <div className="result-rank">#{index + 1}</div>
            <div className="result-preview">
              <svg
                className="result-preview-image"
                viewBox="0 0 1 1"
                preserveAspectRatio="xMidYMid meet"
                aria-label={result.name}
                role="img"
              >
                <path
                  d={previewPaths[result.prefCode] ?? outlinePathCache.get(result.prefCode) ?? ''}
                />
              </svg>
            </div>
            <div className="result-content">
              <div className="result-name">
                <span className="result-name-ja">{result.name}</span>
                <span className="result-name-en">{result.nameEn}</span>
              </div>
              <div className="result-score">
                距離: <strong>{result.score.toFixed(3)}</strong>
              </div>
              {description && <div className="result-description">{description}</div>}
              {index === selectedIndex && (
                <button
                  type="button"
                  className="result-details-toggle"
                  onClick={e => {
                    e.stopPropagation();
                    setExpandedIndex(expandedIndex === index ? null : index);
                  }}
                >
                  {expandedIndex === index ? '距離の内訳を隠す' : '距離の内訳を見る'}
                </button>
              )}
              {index === selectedIndex && expandedIndex === index && result.breakdown && (
                <div className="result-details">
                  <div className="result-details-header">
                    <span>距離の内訳</span>
                  </div>
                  <div className="result-details-grid">
                    {cnnDebug && (
                      <div className="result-details-cnn">
                        <span className="result-detail-label">CNN入力 (SDF)</span>
                        <div className="result-details-cnn-preview">
                          <canvas ref={cnnCanvasRef} />
                        </div>
                      </div>
                    )}
                    {[
                      { key: 'efd', label: 'EFD' },
                      { key: 'turning', label: 'Turning' },
                      { key: 'hu', label: 'Hu' },
                      { key: 'roughness', label: '粗さ' },
                      { key: 'peak', label: 'ピーク差' },
                      { key: 'spread', label: 'ばらつき差' },
                      { key: 'circularity', label: 'Circularity' },
                      { key: 'convexity', label: 'Convexity' },
                      { key: 'solidity', label: 'Solidity' },
                      { key: 'radialFft', label: '半径FFT' },
                      { key: 'knn', label: 'KNN' },
                      { key: 'cnn', label: 'CNN距離' }
                    ]
                      .filter(
                        ({ key }) =>
                          result.breakdown.weights[key as keyof typeof result.breakdown.weights] > 0
                      )
                      .map(({ key, label }) => (
                        <div key={key}>
                          <span className="result-detail-label">{label}</span>
                          <span className="result-detail-value">
                            {result.breakdown.normalized[
                              key as keyof typeof result.breakdown.normalized
                            ].toFixed(3)}
                          </span>
                        </div>
                      ))}
                    {result.breakdown.weights.smoothPenalty > 0 && (
                      <div>
                        <span className="result-detail-label">滑らかさ補正</span>
                        <span className="result-detail-value">
                          {result.breakdown.normalized.smoothPenalty.toFixed(3)}
                        </span>
                      </div>
                    )}
                    {result.breakdown.weights.baseSmoothPenalty > 0 && (
                      <div>
                        <span className="result-detail-label">基準滑らかさ</span>
                        <span className="result-detail-value">
                          {result.breakdown.normalized.baseSmoothPenalty.toFixed(3)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {results.length > DEFAULT_VISIBLE_RESULTS && (
        <button
          type="button"
          className="result-toggle-all"
          onClick={() => setShowAll(prev => !prev)}
        >
          {showAll ? '上位のみ表示する' : 'すべて表示する'}
        </button>
      )}
    </div>
  );
}
