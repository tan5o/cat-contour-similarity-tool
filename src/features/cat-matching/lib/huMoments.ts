import type { Point } from '../types';

/**
 * ポリゴンの面積と重心を計算する（Greenの定理ベース）。
 * @param points 多角形の頂点リスト（閉じた輪郭）
 * @returns 面積と重心
 */
function computePolygonAreaAndCentroid(points: Point[]): { area: number; cx: number; cy: number } {
  const n = points.length;
  if (n < 3) {
    return { area: 0, cx: 0, cy: 0 };
  }

  let signedArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < n; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % n];
    const cross = p0.x * p1.y - p1.x * p0.y;
    signedArea += cross;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
  }

  const area = Math.abs(signedArea) / 2;
  if (area === 0) {
    return { area: 0, cx: 0, cy: 0 };
  }

  // 符号を考慮して重心を計算
  cx = cx / (3 * signedArea);
  cy = cy / (3 * signedArea);

  return { area, cx, cy };
}

/**
 * 重心を原点とした中心モーメントを直接計算する（Greenの定理ベース）。
 * 変換式を使わず直接計算することで、式のミスを避ける。
 * @param points 多角形の頂点リスト
 * @param cx 重心x座標
 * @param cy 重心y座標
 * @returns 中心モーメント
 */
function computeCentralMoments(
  points: Point[],
  cx: number,
  cy: number
): {
  mu20: number;
  mu11: number;
  mu02: number;
  mu30: number;
  mu21: number;
  mu12: number;
  mu03: number;
} {
  const n = points.length;

  let mu20 = 0,
    mu11 = 0,
    mu02 = 0;
  let mu30 = 0,
    mu21 = 0,
    mu12 = 0,
    mu03 = 0;

  // 重心で平行移動した座標でGreenの定理を適用
  for (let i = 0; i < n; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % n];
    // 重心基準の座標
    const x0 = p0.x - cx,
      y0 = p0.y - cy;
    const x1 = p1.x - cx,
      y1 = p1.y - cy;

    const cross = x0 * y1 - x1 * y0;

    // 2次中心モーメント
    mu20 += cross * (x0 * x0 + x0 * x1 + x1 * x1);
    mu11 += cross * (x0 * (2 * y0 + y1) + x1 * (y0 + 2 * y1));
    mu02 += cross * (y0 * y0 + y0 * y1 + y1 * y1);

    // 3次中心モーメント
    mu30 += cross * (x0 * x0 * x0 + x0 * x0 * x1 + x0 * x1 * x1 + x1 * x1 * x1);
    mu03 += cross * (y0 * y0 * y0 + y0 * y0 * y1 + y0 * y1 * y1 + y1 * y1 * y1);
    mu21 += cross * (x0 * x0 * (3 * y0 + y1) + 2 * x0 * x1 * (y0 + y1) + x1 * x1 * (y0 + 3 * y1));
    mu12 += cross * (y0 * y0 * (3 * x0 + x1) + 2 * y0 * y1 * (x0 + x1) + y1 * y1 * (x0 + 3 * x1));
  }

  // 正規化係数を適用
  mu20 /= 12;
  mu11 /= 24;
  mu02 /= 12;
  mu30 /= 20;
  mu21 /= 60;
  mu12 /= 60;
  mu03 /= 20;

  return { mu20, mu11, mu02, mu30, mu21, mu12, mu03 };
}

/**
 * 回転・スケール・並進不変な7つのHuモーメントを計算する。
 * ポリゴンの面モーメント（Greenの定理ベース）から計算。
 * 中心モーメントは変換式を使わず直接計算することで精度を確保。
 * @param points 多角形の頂点リスト
 * @returns 7つのHuモーメントの配列
 */
export function computeHuMoments(points: Point[]): number[] {
  const n = points.length;
  if (n < 3) {
    return [0, 0, 0, 0, 0, 0, 0];
  }

  // 面積と重心を計算
  const { area, cx, cy } = computePolygonAreaAndCentroid(points);
  if (area === 0) {
    return [0, 0, 0, 0, 0, 0, 0];
  }

  // 中心モーメントを直接計算（重心基準）
  const { mu20, mu11, mu02, mu30, mu21, mu12, mu03 } = computeCentralMoments(points, cx, cy);

  // Normalize: ηpq = μpq / area^((p+q)/2 + 1)
  const area2 = area * area;
  const area2_5 = Math.pow(area, 2.5);
  const n20 = mu20 / area2;
  const n11 = mu11 / area2;
  const n02 = mu02 / area2;
  const n30 = mu30 / area2_5;
  const n21 = mu21 / area2_5;
  const n12 = mu12 / area2_5;
  const n03 = mu03 / area2_5;

  // Hu's 7 moments
  const h1 = n20 + n02;
  const h2 = Math.pow(n20 - n02, 2) + 4 * Math.pow(n11, 2);
  const h3 = Math.pow(n30 - 3 * n12, 2) + Math.pow(3 * n21 - n03, 2);
  const h4 = Math.pow(n30 + n12, 2) + Math.pow(n21 + n03, 2);
  const h5 =
    (n30 - 3 * n12) * (n30 + n12) * (Math.pow(n30 + n12, 2) - 3 * Math.pow(n21 + n03, 2)) +
    (3 * n21 - n03) * (n21 + n03) * (3 * Math.pow(n30 + n12, 2) - Math.pow(n21 + n03, 2));
  const h6 =
    (n20 - n02) * (Math.pow(n30 + n12, 2) - Math.pow(n21 + n03, 2)) +
    4 * n11 * (n30 + n12) * (n21 + n03);
  const h7 =
    (3 * n21 - n03) * (n30 + n12) * (Math.pow(n30 + n12, 2) - 3 * Math.pow(n21 + n03, 2)) -
    (n30 - 3 * n12) * (n21 + n03) * (3 * Math.pow(n30 + n12, 2) - Math.pow(n21 + n03, 2));

  // Log transform for better numerical stability
  return [h1, h2, h3, h4, h5, h6, h7].map(h =>
    h === 0 ? 0 : -Math.sign(h) * Math.log10(Math.abs(h))
  );
}

/**
 * バイナリマスクからHuモーメントを計算する（領域モーメント）。
 * @param mask バイナリマスク（0 or 255）
 * @param width マスク幅
 * @param height マスク高さ
 * @returns 7つのHuモーメントの配列
 */
export function computeHuMomentsFromMask(
  mask: Uint8Array,
  width: number,
  height: number
): number[] {
  let m00 = 0,
    m10 = 0,
    m01 = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 0) continue;
      const px = x + 0.5;
      const py = y + 0.5;
      m00 += 1;
      m10 += px;
      m01 += py;
    }
  }

  if (m00 === 0) {
    return [0, 0, 0, 0, 0, 0, 0];
  }

  const xc = m10 / m00;
  const yc = m01 / m00;

  let mu20 = 0,
    mu11 = 0,
    mu02 = 0;
  let mu30 = 0,
    mu21 = 0,
    mu12 = 0,
    mu03 = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 0) continue;
      const dx = x + 0.5 - xc;
      const dy = y + 0.5 - yc;
      const dx2 = dx * dx;
      const dy2 = dy * dy;
      const dx3 = dx2 * dx;
      const dy3 = dy2 * dy;

      mu20 += dx2;
      mu11 += dx * dy;
      mu02 += dy2;
      mu30 += dx3;
      mu21 += dx2 * dy;
      mu12 += dx * dy2;
      mu03 += dy3;
    }
  }

  // Normalize: ηpq = μpq / m00^((p+q)/2 + 1)
  // 2nd order: (p+q=2) → m00^2
  // 3rd order: (p+q=3) → m00^2.5
  const n20 = mu20 / Math.pow(m00, 2);
  const n11 = mu11 / Math.pow(m00, 2);
  const n02 = mu02 / Math.pow(m00, 2);
  const n30 = mu30 / Math.pow(m00, 2.5);
  const n21 = mu21 / Math.pow(m00, 2.5);
  const n12 = mu12 / Math.pow(m00, 2.5);
  const n03 = mu03 / Math.pow(m00, 2.5);

  const h1 = n20 + n02;
  const h2 = Math.pow(n20 - n02, 2) + 4 * Math.pow(n11, 2);
  const h3 = Math.pow(n30 - 3 * n12, 2) + Math.pow(3 * n21 - n03, 2);
  const h4 = Math.pow(n30 + n12, 2) + Math.pow(n21 + n03, 2);
  const h5 =
    (n30 - 3 * n12) * (n30 + n12) * (Math.pow(n30 + n12, 2) - 3 * Math.pow(n21 + n03, 2)) +
    (3 * n21 - n03) * (n21 + n03) * (3 * Math.pow(n30 + n12, 2) - Math.pow(n21 + n03, 2));
  const h6 =
    (n20 - n02) * (Math.pow(n30 + n12, 2) - Math.pow(n21 + n03, 2)) +
    4 * n11 * (n30 + n12) * (n21 + n03);
  const h7 =
    (3 * n21 - n03) * (n30 + n12) * (Math.pow(n30 + n12, 2) - 3 * Math.pow(n21 + n03, 2)) -
    (n30 - 3 * n12) * (n21 + n03) * (3 * Math.pow(n30 + n12, 2) - Math.pow(n21 + n03, 2));

  return [h1, h2, h3, h4, h5, h6, h7].map(h =>
    h === 0 ? 0 : -Math.sign(h) * Math.log10(Math.abs(h))
  );
}
