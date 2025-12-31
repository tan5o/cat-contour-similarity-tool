/**
 * マスク後処理のためのモルフォロジー演算
 */

import { debugLog } from './constants';

/**
 * 円形の構造要素を作成する。
 * @param radius 半径
 * @returns 構造要素配列
 */
function createStructuringElement(radius: number): number[] {
  const size = 2 * radius + 1;
  const se: number[] = new Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - radius;
      const dy = y - radius;
      se[y * size + x] = dx * dx + dy * dy <= radius * radius ? 1 : 0;
    }
  }

  return se;
}

/**
 * モルフォロジー膨張処理を行う。
 * @param mask バイナリマスク
 * @param width 幅
 * @param height 高さ
 * @param radius 半径
 * @returns 処理後のマスク
 */
export function dilate(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number = 1
): Uint8Array {
  const result = new Uint8Array(width * height);
  const se = createStructuringElement(radius);
  const seSize = 2 * radius + 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxVal = 0;

      for (let sy = 0; sy < seSize; sy++) {
        for (let sx = 0; sx < seSize; sx++) {
          if (se[sy * seSize + sx] === 0) continue;

          const ny = y + sy - radius;
          const nx = x + sx - radius;

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const val = mask[ny * width + nx];
            if (val > maxVal) maxVal = val;
          }
        }
      }

      result[y * width + x] = maxVal;
    }
  }

  return result;
}

/**
 * モルフォロジー収縮処理を行う。
 * @param mask バイナリマスク
 * @param width 幅
 * @param height 高さ
 * @param radius 半径
 * @returns 処理後のマスク
 */
export function erode(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number = 1
): Uint8Array {
  const result = new Uint8Array(width * height);
  const se = createStructuringElement(radius);
  const seSize = 2 * radius + 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minVal = 255;

      for (let sy = 0; sy < seSize; sy++) {
        for (let sx = 0; sx < seSize; sx++) {
          if (se[sy * seSize + sx] === 0) continue;

          const ny = y + sy - radius;
          const nx = x + sx - radius;

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const val = mask[ny * width + nx];
            if (val < minVal) minVal = val;
          }
        }
      }

      result[y * width + x] = minVal;
    }
  }

  return result;
}

/**
 * モルフォロジーオープニングを行う。
 * @param mask バイナリマスク
 * @param width 幅
 * @param height 高さ
 * @param radius 半径
 * @returns 処理後のマスク
 */
export function open(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number = 2
): Uint8Array {
  const eroded = erode(mask, width, height, radius);
  return dilate(eroded, width, height, radius);
}

/**
 * モルフォロジークロージングを行う。
 * @param mask バイナリマスク
 * @param width 幅
 * @param height 高さ
 * @param radius 半径
 * @returns 処理後のマスク
 */
export function close(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number = 2
): Uint8Array {
  const dilated = dilate(mask, width, height, radius);
  return erode(dilated, width, height, radius);
}

/**
 * 連結成分を見つける。
 * @param mask バイナリマスク
 * @param width 幅
 * @param height 高さ
 * @returns ラベル配列と成分数
 */
export function findConnectedComponents(
  mask: Uint8Array,
  width: number,
  height: number
): { labels: Int32Array; count: number } {
  const labels = new Int32Array(width * height);
  let currentLabel = 0;

  function floodFill(startX: number, startY: number, label: number): number {
    const stack: [number, number][] = [[startX, startY]];
    let area = 0;

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;

      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const idx = y * width + x;

      if (mask[idx] === 0 || labels[idx] !== 0) continue;

      labels[idx] = label;
      area++;

      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }

    return area;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      if (mask[idx] > 0 && labels[idx] === 0) {
        currentLabel++;
        floodFill(x, y, currentLabel);
      }
    }
  }

  return { labels, count: currentLabel };
}

/**
 * 最大の連結成分を抽出する。
 * @param mask バイナリマスク
 * @param width 幅
 * @param height 高さ
 * @returns 最大成分のみを含むマスク
 */
export function getLargestComponent(mask: Uint8Array, width: number, height: number): Uint8Array {
  const { labels, count } = findConnectedComponents(mask, width, height);

  if (count === 0) return mask;

  // Count area of each component
  const areas = new Array(count + 1).fill(0);
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] > 0) areas[labels[i]]++;
  }

  // Find largest
  let maxLabel = 1;
  let maxArea = areas[1];
  for (let i = 2; i <= count; i++) {
    if (areas[i] > maxArea) {
      maxArea = areas[i];
      maxLabel = i;
    }
  }

  // Create output mask
  const result = new Uint8Array(width * height);
  for (let i = 0; i < labels.length; i++) {
    result[i] = labels[i] === maxLabel ? 255 : 0;
  }

  return result;
}

/**
 * バイナリマスクの穴埋めを行う。
 * @param mask バイナリマスク
 * @param width 幅
 * @param height 高さ
 * @returns 穴埋めされたマスク
 */
export function fillHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
  // Find background components connected to border
  const inverted = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    inverted[i] = mask[i] === 0 ? 255 : 0;
  }

  const labels = new Int32Array(width * height);
  const borderLabel = 1;

  // Flood fill from border
  function floodFillBorder(startX: number, startY: number): void {
    const stack: [number, number][] = [[startX, startY]];

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;

      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const idx = y * width + x;

      if (inverted[idx] === 0 || labels[idx] !== 0) continue;

      labels[idx] = borderLabel;

      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }
  }

  // Flood from all border pixels
  for (let x = 0; x < width; x++) {
    if (inverted[x] > 0) floodFillBorder(x, 0);
    if (inverted[(height - 1) * width + x] > 0) floodFillBorder(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    if (inverted[y * width] > 0) floodFillBorder(0, y);
    if (inverted[y * width + width - 1] > 0) floodFillBorder(width - 1, y);
  }

  // Fill everything not connected to border
  const result = new Uint8Array(width * height);
  for (let i = 0; i < result.length; i++) {
    result[i] = labels[i] === borderLabel ? 0 : 255;
  }

  return result;
}

/**
 * 完全なマスク後処理パイプラインを実行する。
 * オープニング、クロージング、最大成分抽出、穴埋めを順に行う。
 * @param mask バイナリマスク
 * @param width 幅
 * @param height 高さ
 * @returns 後処理済みのマスク
 */
export function postprocessMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  // Debug: Count input mask
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 0) count++;
  }
  debugLog(`[Postprocess] Input: ${count}/${mask.length} non-zero pixels`);

  // 1. Opening to remove small noise (use radius 1 for sparse masks)
  let processed = open(mask, width, height, 1);
  count = 0;
  for (let i = 0; i < processed.length; i++) {
    if (processed[i] > 0) count++;
  }
  debugLog(`[Postprocess] After opening: ${count}/${processed.length} non-zero pixels`);

  // 2. Closing to fill small gaps (use larger radius to connect thin gaps)
  processed = close(processed, width, height, 3);
  count = 0;
  for (let i = 0; i < processed.length; i++) {
    if (processed[i] > 0) count++;
  }
  debugLog(`[Postprocess] After closing: ${count}/${processed.length} non-zero pixels`);

  // 3. Keep only largest component
  processed = getLargestComponent(processed, width, height);
  count = 0;
  for (let i = 0; i < processed.length; i++) {
    if (processed[i] > 0) count++;
  }
  debugLog(`[Postprocess] After largest component: ${count}/${processed.length} non-zero pixels`);

  // 4. Fill holes
  processed = fillHoles(processed, width, height);
  count = 0;
  for (let i = 0; i < processed.length; i++) {
    if (processed[i] > 0) count++;
  }
  debugLog(`[Postprocess] After fill holes: ${count}/${processed.length} non-zero pixels`);

  return processed;
}
