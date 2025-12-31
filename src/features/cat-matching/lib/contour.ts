import type { Point, Contour } from '../types';
import { debugLog, MIN_CONTOUR_POINTS } from './constants';

export interface ContourTransform {
  centroid: Point;
  scale: number;
  angle: number;
}

/**
 * マーチングスクエア法を用いて、バイナリマスクから輪郭を抽出する。
 * @param mask バイナリマスクデータ（0または255）
 * @param width マスクの幅
 * @param height マスクの高さ
 * @returns 抽出された輪郭のリスト
 */
export function extractContour(mask: Uint8Array, width: number, height: number): Contour[] {
  if (import.meta.env.DEV) {
    let nonZeroPixels = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] > 0) nonZeroPixels++;
    }
    debugLog(
      `Mask stats: ${nonZeroPixels}/${mask.length} non-zero pixels (${((nonZeroPixels / mask.length) * 100).toFixed(2)}%)`
    );
    debugLog(`Mask dimensions: ${width}x${height}`);
  }

  // パディングを追加して、マスクが画像端に接している場合でも輪郭が閉じるようにする
  const padding = 1;
  const paddedWidth = width + 2 * padding;
  const paddedHeight = height + 2 * padding;
  const paddedMask = new Uint8Array(paddedWidth * paddedHeight);

  // 元のマスクをパディング領域の中央にコピー
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      paddedMask[(y + padding) * paddedWidth + (x + padding)] = mask[y * width + x];
    }
  }

  const getPixel = (x: number, y: number): number => {
    if (x < 0 || x >= paddedWidth || y < 0 || y >= paddedHeight) return 0;
    return paddedMask[y * paddedWidth + x] > 0 ? 1 : 0;
  };

  const toKey = (p: Point): string => `${Math.round(p.x * 2)},${Math.round(p.y * 2)}`;
  const segments: Array<{ a: string; b: string }> = [];
  const pointsByKey = new Map<string, Point>();
  const adjacency = new Map<string, number[]>();

  const addSegment = (p1: Point, p2: Point) => {
    const a = toKey(p1);
    const b = toKey(p2);
    if (a === b) return;
    if (!pointsByKey.has(a)) pointsByKey.set(a, { x: p1.x, y: p1.y });
    if (!pointsByKey.has(b)) pointsByKey.set(b, { x: p2.x, y: p2.y });
    const index = segments.length;
    segments.push({ a, b });
    const listA = adjacency.get(a) ?? [];
    listA.push(index);
    adjacency.set(a, listA);
    const listB = adjacency.get(b) ?? [];
    listB.push(index);
    adjacency.set(b, listB);
  };

  // Marching squares: build segments from 2x2 cells (using padded dimensions)
  for (let y = 0; y < paddedHeight - 1; y++) {
    for (let x = 0; x < paddedWidth - 1; x++) {
      const tl = getPixel(x, y);
      const tr = getPixel(x + 1, y);
      const br = getPixel(x + 1, y + 1);
      const bl = getPixel(x, y + 1);

      const top = { x: x + 0.5, y };
      const right = { x: x + 1, y: y + 0.5 };
      const bottom = { x: x + 0.5, y: y + 1 };
      const left = { x, y: y + 0.5 };

      const intersections: Array<{ edge: 'top' | 'right' | 'bottom' | 'left'; point: Point }> = [];
      if (tl !== tr) intersections.push({ edge: 'top', point: top });
      if (tr !== br) intersections.push({ edge: 'right', point: right });
      if (bl !== br) intersections.push({ edge: 'bottom', point: bottom });
      if (tl !== bl) intersections.push({ edge: 'left', point: left });

      if (intersections.length === 2) {
        addSegment(intersections[0].point, intersections[1].point);
      } else if (intersections.length === 4) {
        // Ambiguous cases (5 and 10). Use diagonal decision based on corner pattern.
        if (tl === br && tr === bl) {
          if (tl === 1) {
            addSegment(top, right);
            addSegment(bottom, left);
          } else {
            addSegment(top, left);
            addSegment(bottom, right);
          }
        }
      }
    }
  }

  const usedSegments = new Set<number>();
  const closedContours: Contour[] = [];
  const openContours: Contour[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (usedSegments.has(i)) continue;
    const startSeg = segments[i];
    const startKey = startSeg.a;
    let currentKey = startSeg.b;
    let prevSeg = i;
    const points: Point[] = [];
    const startPoint = pointsByKey.get(startKey);
    const firstPoint = pointsByKey.get(currentKey);
    if (!startPoint || !firstPoint) {
      usedSegments.add(i);
      continue;
    }
    points.push(startPoint);
    points.push(firstPoint);
    usedSegments.add(i);

    while (currentKey !== startKey) {
      const candidates = (adjacency.get(currentKey) ?? []).filter(
        idx => idx !== prevSeg && !usedSegments.has(idx)
      );
      if (candidates.length === 0) break;
      const nextSeg = candidates[0];
      usedSegments.add(nextSeg);
      const seg = segments[nextSeg];
      const nextKey = seg.a === currentKey ? seg.b : seg.a;
      if (nextKey === startKey) {
        currentKey = nextKey;
        break;
      }
      const nextPoint = pointsByKey.get(nextKey);
      if (!nextPoint) break;
      points.push(nextPoint);
      prevSeg = nextSeg;
      currentKey = nextKey;
    }

    // 輪郭が閉じているかチェック（startKeyに戻っているか）
    const isClosed = currentKey === startKey;

    if (points.length > MIN_CONTOUR_POINTS) {
      // パディング分のオフセットを引いて元の座標系に戻す
      const adjustedPoints = points
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
        .map(p => ({
          x: p.x - padding,
          y: p.y - padding
        }));
      if (adjustedPoints.length < 2) {
        continue;
      }

      const area = isClosed ? calculateArea(adjustedPoints) : 0;
      const perimeter = calculatePerimeter(adjustedPoints, isClosed);
      const contour = { points: adjustedPoints, area, perimeter, isClosed };

      if (isClosed) {
        closedContours.push(contour);
        debugLog(
          `Found closed contour: ${adjustedPoints.length} points, area=${area.toFixed(2)}, perimeter=${perimeter.toFixed(2)}`
        );
      } else {
        openContours.push(contour);
        debugLog(
          `Found open contour (ignored): ${adjustedPoints.length} points, area=${area.toFixed(2)}, perimeter=${perimeter.toFixed(2)}`
        );
      }
    }
  }

  // 閉じた輪郭を優先して返す
  // 閉じた輪郭がない場合のみ、開いた輪郭を使用（フォールバック）
  if (closedContours.length > 0) {
    debugLog(
      `Total contours found: ${closedContours.length} closed (${openContours.length} open ignored), segments: ${segments.length}`
    );
    return closedContours;
  } else if (openContours.length > 0) {
    debugLog(
      `Warning: No closed contours found, using ${openContours.length} open contours as fallback`
    );
    return openContours;
  }

  debugLog(`Total contours found: 0 (segments: ${segments.length})`);
  return [];
}

/**
 * 靴紐の公式を用いて多角形の面積を計算する。
 * @param points 多角形の頂点リスト
 * @returns 面積
 */
export function calculateArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * 多角形の周囲長を計算する。
 * @param points 多角形の頂点リスト
 * @returns 周囲長
 */
export function calculatePerimeter(points: Point[], closed: boolean = true): number {
  if (points.length < 2) return 0;
  let perimeter = 0;
  const limit = closed ? points.length : points.length - 1;
  for (let i = 0; i < limit; i++) {
    const j = i + 1;
    if (!points[j]) break;
    const dx = points[j].x - points[i].x;
    const dy = points[j].y - points[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}

/**
 * 面積が最大の輪郭を取得する。
 * @param contours 輪郭のリスト
 * @returns 最大の輪郭、または見つからない場合はnull
 */
export function getLargestContour(contours: Contour[]): Contour | null {
  if (contours.length === 0) return null;
  const hasClosed = contours.some(contour => contour.isClosed);
  if (hasClosed) {
    const closedContours = contours.filter(contour => contour.isClosed);
    return closedContours.reduce((max, c) => (c.area > max.area ? c : max));
  }
  return contours.reduce((max, c) => (c.perimeter > max.perimeter ? c : max));
}

/**
 * ダグラス・プッカー法を用いて多角形を単純化する。
 * @param points 多角形の頂点リスト
 * @param epsilon 許容誤差
 * @returns 単純化された頂点リスト
 */
export function simplifyContour(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;

  function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const norm = Math.sqrt(dx * dx + dy * dy);

    if (norm === 0) return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);

    return (
      Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) /
      norm
    );
  }

  function douglasPeucker(pts: Point[], eps: number): Point[] {
    let maxDist = 0;
    let maxIndex = 0;
    const end = pts.length - 1;

    for (let i = 1; i < end; i++) {
      const dist = perpendicularDistance(pts[i], pts[0], pts[end]);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > eps) {
      const left = douglasPeucker(pts.slice(0, maxIndex + 1), eps);
      const right = douglasPeucker(pts.slice(maxIndex), eps);
      return [...left.slice(0, -1), ...right];
    }

    return [pts[0], pts[end]];
  }

  return douglasPeucker(points, epsilon);
}

/**
 * 単純化が強すぎて点が減りすぎる場合は、段階的にepsilonを下げる。
 */
export function simplifyContourAdaptive(
  points: Point[],
  epsilon: number,
  minPoints: number
): Point[] {
  if (points.length < 3) return points;
  let currentEpsilon = epsilon;
  let simplified = simplifyContour(points, currentEpsilon);

  while (simplified.length < minPoints && currentEpsilon > 0.25) {
    currentEpsilon *= 0.5;
    simplified = simplifyContour(points, currentEpsilon);
  }

  return simplified.length < Math.min(points.length, minPoints) ? points : simplified;
}

/**
 * 重心を計算する。
 * @param points 点のリスト
 * @returns 重心座標
 */
function getCentroid(points: Point[]): Point {
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  return { x: sumX / points.length, y: sumY / points.length };
}

/**
 * 輪郭を中心化する。
 * @param points 点のリスト
 * @returns 中心化された点リストと重心
 */
function centerContour(points: Point[]): { points: Point[]; centroid: Point } {
  const centroid = getCentroid(points);
  const centered = points.map(p => ({
    x: p.x - centroid.x,
    y: p.y - centroid.y
  }));
  return { points: centered, centroid };
}

/**
 * 輪郭をスケーリングする（最大距離で正規化）。
 * @param points 点のリスト
 * @param targetSize ターゲットサイズ
 * @returns スケーリングされた点リストとスケール係数
 */
function scaleContour(points: Point[], targetSize?: number): { points: Point[]; scale: number } {
  let maxDist = 0;
  for (const p of points) {
    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    if (dist > maxDist) maxDist = dist;
  }

  const scale = targetSize ? targetSize / 2 / maxDist : 1 / maxDist;
  const scaled = points.map(p => ({
    x: p.x * scale,
    y: p.y * scale
  }));

  return { points: scaled, scale };
}

/**
 * PCAで輪郭の向きを揃える。
 * @param points 点のリスト
 * @returns 回転された点リストと回転角度
 */
function alignContourPCA(points: Point[]): { points: Point[]; angle: number } {
  let sumX2 = 0;
  let sumY2 = 0;
  let sumXY = 0;

  for (const p of points) {
    sumX2 += p.x * p.x;
    sumY2 += p.y * p.y;
    sumXY += p.x * p.y;
  }

  // 共分散行列の固有ベクトルを計算
  // Cov = [[sumX2, sumXY], [sumXY, sumY2]] / N
  // 2x2行列の固有値問題として解く

  // 角度を計算 (atan2(2*CovXY, CovXX - CovYY) / 2)
  const angle = 0.5 * Math.atan2(2 * sumXY, sumX2 - sumY2);

  // 回転
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);

  const rotated = points.map(p => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos
  }));

  // 向きの統一（X軸の正の方向に重みがあるようにする）
  // 3次モーメント（skewness）をチェック
  let skewX = 0;
  for (const p of rotated) {
    skewX += p.x * p.x * p.x;
  }

  if (skewX < 0) {
    // 180度回転
    for (let i = 0; i < rotated.length; i++) {
      rotated[i].x = -rotated[i].x;
      rotated[i].y = -rotated[i].y;
    }
    return { points: rotated, angle: angle + Math.PI };
  }

  return { points: rotated, angle };
}

/**
 * 輪郭を等間隔にリサンプリングする。
 * @param points 点のリスト
 * @param numPoints 目標点数
 * @returns リサンプリングされた点リスト
 */
export function resampleContour(
  points: Point[],
  numPoints: number,
  closed: boolean = true
): Point[] {
  if (points.length < 2) return points;

  // 全長を計算
  let totalLength = 0;
  const segmentLengths: number[] = [];

  const segmentCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < segmentCount; i++) {
    const p1 = points[i];
    const p2 = closed ? points[(i + 1) % points.length] : points[i + 1];
    const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    totalLength += dist;
    segmentLengths.push(dist);
  }

  if (totalLength === 0) return points;
  const step = totalLength / (closed ? numPoints : Math.max(1, numPoints - 1));
  const resampled: Point[] = [];
  let currentDist = 0;
  let currentSegmentIndex = 0;

  for (let i = 0; i < numPoints; i++) {
    const targetDist = i * step;

    // ターゲット距離まで進む
    while (
      currentSegmentIndex < segmentLengths.length - 1 &&
      currentDist + segmentLengths[currentSegmentIndex] < targetDist
    ) {
      currentDist += segmentLengths[currentSegmentIndex];
      currentSegmentIndex += 1;
    }

    // 線形補間
    const segmentStart = points[currentSegmentIndex];
    const segmentEnd = closed
      ? points[(currentSegmentIndex + 1) % points.length]
      : points[Math.min(currentSegmentIndex + 1, points.length - 1)];
    const segmentLen = segmentLengths[currentSegmentIndex];
    const remainingDist = targetDist - currentDist;

    if (segmentLen > 0) {
      const t = remainingDist / segmentLen;
      resampled.push({
        x: segmentStart.x + (segmentEnd.x - segmentStart.x) * t,
        y: segmentStart.y + (segmentEnd.y - segmentStart.y) * t
      });
    } else {
      resampled.push(segmentStart);
    }
  }

  return resampled;
}

/**
 * 輪郭を正規化する。
 * @param points 点のリスト
 * @param numPoints リサンプリング点数
 * @returns 正規化された輪郭情報
 */
export function normalizeContour(
  points: Point[],
  numPoints: number = 128,
  closed: boolean = true
): { points: Point[]; transform: ContourTransform } {
  // 1. 中心化
  const { points: centered, centroid } = centerContour(points);

  // 2. スケーリング
  const { points: scaled, scale } = scaleContour(centered, 1.0);

  // 3. PCAによる向き合わせ
  const { points: aligned, angle } = alignContourPCA(scaled);

  // 4. リサンプリング
  const resampled = resampleContour(aligned, numPoints, closed);

  return {
    points: resampled,
    transform: {
      centroid,
      scale,
      angle
    }
  };
}
