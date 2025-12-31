import type { Point } from '../types';
import {
  DEFAULT_EFD_ORDER,
  DEFAULT_EFD_RESAMPLE_POINTS,
  NORMALIZED_CONTOUR_SIZE
} from './constants';

/**
 * 輪郭点列を等間隔（弧長パラメータ）でリサンプリングする。
 * EFD計算の前処理として使用し、点数を統一する。
 * @param points 入力輪郭点列
 * @param n リサンプリング後の点数
 * @returns リサンプリングされた点列
 */
export function resampleClosed(points: Point[], n: number = NORMALIZED_CONTOUR_SIZE): Point[] {
  if (points.length < 5) return points;

  // 閉曲線として扱うため、最初と最後が異なれば閉じる
  const pts = points.slice();
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first.x !== last.x || first.y !== last.y) {
    pts.push({ x: first.x, y: first.y });
  }

  // 各セグメントの長さと累積長を計算
  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const d = Math.hypot(dx, dy);
    segLen.push(d);
    total += d;
  }
  if (total < 1e-8) return pts;

  const out: Point[] = [];
  const step = total / n;

  let acc = 0;
  let i = 0;
  out.push({ x: pts[0].x, y: pts[0].y });

  for (let k = 1; k < n; k++) {
    const target = k * step;
    while (i < segLen.length && acc + segLen[i] < target) {
      acc += segLen[i];
      i++;
    }
    const remain = target - acc;
    const d = segLen[i] || 1e-8;
    const t = remain / d;
    const p0 = pts[i];
    const p1 = pts[i + 1] || pts[i];
    out.push({
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t
    });
  }
  return out;
}

/**
 * 楕円フーリエ記述子（EFD）を計算する（pyefd互換の弧長パラメータ版）。
 * 輪郭の差分と弧長を使用して、より正確な形状記述を行う。
 * @param pointsIn 多角形の頂点リスト
 * @param order 次数（デフォルト: DEFAULT_EFD_ORDER）
 * @param numSamples リサンプリング点数（デフォルト: DEFAULT_EFD_RESAMPLE_POINTS = 128）
 * @returns フーリエ係数の配列 [a1, b1, c1, d1, a2, b2, c2, d2, ...]
 */
export function computeEFD(
  pointsIn: Point[],
  order: number = DEFAULT_EFD_ORDER,
  numSamples: number = DEFAULT_EFD_RESAMPLE_POINTS
): number[] {
  // 等間隔リサンプリング
  const pts = resampleClosed(pointsIn, numSamples);
  const N = pts.length;
  if (N < 3) return new Array(order * 4).fill(0);

  // 差分と弧長を計算
  const dx = new Float64Array(N);
  const dy = new Float64Array(N);
  const dt = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const ddx = pts[j].x - pts[i].x;
    const ddy = pts[j].y - pts[i].y;
    dx[i] = ddx;
    dy[i] = ddy;
    dt[i] = Math.hypot(ddx, ddy);
  }

  // 累積弧長
  const t = new Float64Array(N + 1);
  t[0] = 0;
  for (let i = 0; i < N; i++) {
    t[i + 1] = t[i] + dt[i];
  }
  const T = t[N]; // 全周長
  if (T < 1e-8) return new Array(order * 4).fill(0);

  const coeffs: number[] = [];
  const twoPiOverT = (2 * Math.PI) / T;

  for (let n = 1; n <= order; n++) {
    let a = 0,
      b = 0,
      c = 0,
      d = 0;
    const coef = twoPiOverT * n;

    for (let i = 0; i < N; i++) {
      if (dt[i] < 1e-12) continue;

      const ti = t[i];
      const tip1 = t[i + 1];

      // cos(coef * t_{i+1}) - cos(coef * t_i)
      const c1 = Math.cos(coef * tip1) - Math.cos(coef * ti);
      // sin(coef * t_{i+1}) - sin(coef * t_i)
      const s1 = Math.sin(coef * tip1) - Math.sin(coef * ti);

      // pyefd式の係数計算
      a += (dx[i] / dt[i]) * c1;
      b += (dx[i] / dt[i]) * s1;
      c += (dy[i] / dt[i]) * c1;
      d += (dy[i] / dt[i]) * s1;
    }

    // スケール係数: T / (2π²n²)
    const scale = T / (2 * Math.PI * Math.PI * n * n);
    a *= scale;
    b *= scale;
    c *= scale;
    d *= scale;

    coeffs.push(a, b, c, d);
  }

  return coeffs;
}

/**
 * pyefd互換のEFD正規化。
 * 開始点不変・回転不変・サイズ不変の係数を返す。
 * 正規化後: a1 = 1.0, b1 = 0.0, c1 = 0.0, d1のみが意味のある値
 * @param coeffs フーリエ係数の配列 [a1, b1, c1, d1, a2, b2, c2, d2, ...]
 * @returns pyefd互換の正規化された係数配列（同じ形式）
 */
export function normalizeEFDPyefd(coeffs: number[]): number[] {
  if (coeffs.length < 4) return coeffs;

  const order = coeffs.length / 4;
  // coeffsを[order x 4]の2D配列として扱う
  const result = coeffs.slice();

  // 1. 開始点不変化: theta_1を計算して位相シフト
  const a1 = result[0],
    b1 = result[1],
    c1 = result[2],
    d1 = result[3];
  const theta1 = 0.5 * Math.atan2(2 * (a1 * b1 + c1 * d1), a1 * a1 - b1 * b1 + c1 * c1 - d1 * d1);

  // 全係数をtheta1で回転
  for (let n = 1; n <= order; n++) {
    const idx = (n - 1) * 4;
    const an = result[idx],
      bn = result[idx + 1];
    const cn = result[idx + 2],
      dn = result[idx + 3];

    const cosNTheta = Math.cos(n * theta1);
    const sinNTheta = Math.sin(n * theta1);

    // 2x2行列の右乗算: [an bn; cn dn] * [[cos, -sin], [sin, cos]]
    result[idx] = an * cosNTheta + bn * sinNTheta;
    result[idx + 1] = -an * sinNTheta + bn * cosNTheta;
    result[idx + 2] = cn * cosNTheta + dn * sinNTheta;
    result[idx + 3] = -cn * sinNTheta + dn * cosNTheta;
  }

  // 2. 回転不変化: psi_1を計算して長軸をx軸に平行化
  const a1New = result[0],
    c1New = result[2];
  const psi1 = Math.atan2(c1New, a1New);
  const cosPsi = Math.cos(psi1);
  const sinPsi = Math.sin(psi1);

  for (let n = 1; n <= order; n++) {
    const idx = (n - 1) * 4;
    const an = result[idx],
      bn = result[idx + 1];
    const cn = result[idx + 2],
      dn = result[idx + 3];

    // 2x2行列の左乗算: [[cos, sin], [-sin, cos]] * [an bn; cn dn]
    result[idx] = cosPsi * an + sinPsi * cn;
    result[idx + 1] = cosPsi * bn + sinPsi * dn;
    result[idx + 2] = -sinPsi * an + cosPsi * cn;
    result[idx + 3] = -sinPsi * bn + cosPsi * dn;
  }

  // 3. サイズ不変化: a1で正規化
  const scale = Math.abs(result[0]);
  if (scale < 1e-10) return result;

  for (let i = 0; i < result.length; i++) {
    result[i] /= scale;
  }

  return result;
}

/**
 * EFD係数を第1高調波の振幅で正規化し、スケール不変にする。
 * pyefd互換の正規化方式。
 * @param coeffs フーリエ係数の配列 [a1, b1, c1, d1, a2, b2, c2, d2, ...]
 * @returns 正規化された係数配列（同じ形式）
 */
export function normalizeEFDCoeffs(coeffs: number[]): number[] {
  if (coeffs.length < 4) return coeffs;

  // 第1高調波の振幅でスケール正規化
  const a1 = coeffs[0];
  const b1 = coeffs[1];
  const c1 = coeffs[2];
  const d1 = coeffs[3];
  const scale = Math.sqrt(a1 * a1 + b1 * b1 + c1 * c1 + d1 * d1);
  if (scale < 1e-10) return coeffs;

  return coeffs.map(c => c / scale);
}

/**
 * EFD係数を振幅ベースで正規化し、開始点・回転・スケール不変にする。
 * 各周波数成分の振幅（magnitude）のみを使用することで、
 * 位相（開始点）と回転に対して不変な特徴量を得る。
 * @param coeffs フーリエ係数の配列 [a1, b1, c1, d1, a2, b2, c2, d2, ...]
 * @returns 正規化された振幅の配列（各周波数につき1値）
 */
export function normalizeEFD(coeffs: number[]): number[] {
  if (coeffs.length < 4) return coeffs;

  // 各周波数の振幅を計算: sqrt(a^2 + b^2 + c^2 + d^2)
  const magnitudes: number[] = [];
  for (let i = 0; i < coeffs.length; i += 4) {
    const a = coeffs[i];
    const b = coeffs[i + 1];
    const c = coeffs[i + 2];
    const d = coeffs[i + 3];
    const mag = Math.sqrt(a * a + b * b + c * c + d * d);
    magnitudes.push(mag);
  }

  // 第1周波数（基本周波数）の振幅でスケール正規化
  const scale = magnitudes[0];
  if (scale < 1e-10) return magnitudes;

  return magnitudes.map(m => m / scale);
}
