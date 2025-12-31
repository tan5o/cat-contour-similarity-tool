import type { Point } from '../types';
import { DEFAULT_TURNING_SAMPLES, TURNING_SMOOTH_PASSES, TURNING_SMOOTH_WINDOW } from './constants';

/**
 * 弧長の関数としての累積角度変化（Turning Function）を計算する。
 * 輪郭を弧長でパラメータ化し、各位置での接線角度を記録する。
 * @param points 多角形の頂点リスト
 * @param numSamples サンプル数（デフォルト: 128）
 * @returns リサンプリングされた累積角度の配列
 */
export function computeTurningFunction(
  points: Point[],
  numSamples: number = DEFAULT_TURNING_SAMPLES
): number[] {
  const n = points.length;
  if (n < 2) return [];

  // Calculate arc length at each vertex and tangent angles
  const arcLengths: number[] = [0];
  const tangentAngles: number[] = [];
  let totalLength = 0;

  for (let i = 0; i < n; i++) {
    const curr = points[i];
    const next = points[(i + 1) % n];
    const dx = next.x - curr.x;
    const dy = next.y - curr.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    totalLength += segmentLength;
    arcLengths.push(totalLength);

    // Tangent angle of the current segment
    const angle = Math.atan2(dy, dx);
    tangentAngles.push(angle);
  }

  if (totalLength === 0) return new Array(numSamples).fill(0);

  // Compute cumulative turning angle (normalized by total perimeter)
  let cumulativeAngle = 0;
  const turningFunction: Array<{ arcLength: number; angle: number }> = [{ arcLength: 0, angle: 0 }];

  for (let i = 1; i < n; i++) {
    let deltaAngle = tangentAngles[i] - tangentAngles[i - 1];
    // Normalize to [-π, π]
    while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
    while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
    cumulativeAngle += deltaAngle;
    turningFunction.push({ arcLength: arcLengths[i], angle: cumulativeAngle });
  }

  // Handle wrap-around (closing the contour)
  let closingDelta = tangentAngles[0] - tangentAngles[n - 1];
  while (closingDelta > Math.PI) closingDelta -= 2 * Math.PI;
  while (closingDelta < -Math.PI) closingDelta += 2 * Math.PI;
  cumulativeAngle += closingDelta;
  turningFunction.push({ arcLength: totalLength, angle: cumulativeAngle });

  // Resample uniformly by arc length
  const resampled: number[] = [];
  const stepLength = totalLength / numSamples;

  for (let i = 0; i < numSamples; i++) {
    const targetLength = i * stepLength;
    // Find the segment containing targetLength
    let j = 0;
    while (j < turningFunction.length - 1 && turningFunction[j + 1].arcLength < targetLength) {
      j++;
    }

    // Linear interpolation
    if (j < turningFunction.length - 1) {
      const t0 = turningFunction[j].arcLength;
      const t1 = turningFunction[j + 1].arcLength;
      const a0 = turningFunction[j].angle;
      const a1 = turningFunction[j + 1].angle;
      const ratio = t1 > t0 ? (targetLength - t0) / (t1 - t0) : 0;
      const interpolatedAngle = a0 + ratio * (a1 - a0);
      resampled.push(interpolatedAngle);
    } else {
      resampled.push(turningFunction[turningFunction.length - 1].angle);
    }
  }

  return resampled;
}

function smoothContourPoints(
  points: Point[],
  windowSize: number = TURNING_SMOOTH_WINDOW,
  passes: number = TURNING_SMOOTH_PASSES
): Point[] {
  if (points.length === 0) return points;
  let current = points;
  for (let pass = 0; pass < passes; pass++) {
    const half = Math.floor(windowSize / 2);
    const smoothed: Point[] = [];
    const n = current.length;

    for (let i = 0; i < n; i++) {
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (let j = -half; j <= half; j++) {
        const idx = (i + j + n) % n;
        const p = current[idx];
        sumX += p.x;
        sumY += p.y;
        count += 1;
      }
      smoothed.push({ x: sumX / count, y: sumY / count });
    }

    current = smoothed;
  }

  return current;
}

export function smoothContourForMatching(points: Point[]): Point[] {
  return smoothContourPoints(points);
}

export function smoothContourForCatDisplay(points: Point[]): Point[] {
  return smoothContourPoints(points, 9, 1);
}

/**
 * 累積角度列から差分（局所曲率）を計算する。
 * @param turning 累積角度の配列
 * @returns 差分の配列（角度変化率 ≈ 曲率）
 */
function computeTurningDiff(turning: number[]): number[] {
  if (turning.length < 2) return [];
  const diffs: number[] = [];
  for (let i = 1; i < turning.length; i++) {
    let d = turning[i] - turning[i - 1];
    // [-π, π]に正規化
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    diffs.push(d);
  }
  return diffs;
}

/**
 * Turning Functionの粗さ（差分の絶対値の平均）を計算する。
 * 差分は局所的な曲率に相当し、形状の複雑さや尖り具合を捉える。
 * @param turning Turning Function（累積角度）の配列
 * @returns 粗さのスコア
 */
export function turningRoughness(turning: number[]): number {
  const diffs = computeTurningDiff(turning);
  if (diffs.length === 0) return 0;
  const total = diffs.reduce((sum, v) => sum + Math.abs(v), 0);
  return total / diffs.length;
}

/**
 * Turning Functionの統計量（差分の平均、最大、標準偏差）を計算する。
 * 差分は局所的な曲率に相当する。
 * @param turning Turning Function（累積角度）の配列
 * @returns 統計量オブジェクト
 */
export function turningStats(turning: number[]): {
  meanAbs: number;
  maxAbs: number;
  stdAbs: number;
} {
  const diffs = computeTurningDiff(turning);
  if (diffs.length === 0) return { meanAbs: 0, maxAbs: 0, stdAbs: 0 };

  let sum = 0;
  let maxAbs = 0;
  for (const d of diffs) {
    const a = Math.abs(d);
    sum += a;
    if (a > maxAbs) maxAbs = a;
  }
  const meanAbs = sum / diffs.length;

  let varSum = 0;
  for (const d of diffs) {
    const a = Math.abs(d);
    const diff = a - meanAbs;
    varSum += diff * diff;
  }
  const stdAbs = Math.sqrt(varSum / diffs.length);

  return { meanAbs, maxAbs, stdAbs };
}
