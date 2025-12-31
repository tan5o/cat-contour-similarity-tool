import type { Point } from '../types';
import { DEFAULT_RADIAL_FFT_BINS } from './constants';

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function convexHull(points: Point[]): Point[] {
  if (points.length <= 1) return points.slice();

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeter(points: Point[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

function centroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  return { x: sumX / points.length, y: sumY / points.length };
}

/**
 * 重心からの半径の離散フーリエ変換を計算する。
 * 形状の周波数成分を表現し、回転不変な特徴量を得る。
 * @param points 多角形の頂点リスト
 * @param bins 計算する周波数ビン数（デフォルト: DEFAULT_RADIAL_FFT_BINS）
 * @returns 各周波数成分の振幅配列
 */
export function computeRadialFft(
  points: Point[],
  bins: number = DEFAULT_RADIAL_FFT_BINS
): number[] {
  if (points.length === 0) return [];
  const c = centroid(points);
  const distances = points.map(p => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return Math.sqrt(dx * dx + dy * dy);
  });
  const mean = distances.reduce((sum, v) => sum + v, 0) / distances.length || 1;
  const normalized = distances.map(v => v / mean);
  const n = normalized.length;
  const maxBins = Math.min(bins, Math.floor(n / 2));
  const magnitudes: number[] = [];

  for (let k = 1; k <= maxBins; k++) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * k * t) / n;
      re += normalized[t] * Math.cos(angle);
      im -= normalized[t] * Math.sin(angle); // DFT: exp(-j*2πkt/n)
    }
    // 振幅を計算して正規化
    // 実信号の片側スペクトルなので 2/n を掛ける（k≠0の場合）
    const mag = (2 / n) * Math.sqrt(re * re + im * im);
    magnitudes.push(mag);
  }

  return magnitudes;
}
