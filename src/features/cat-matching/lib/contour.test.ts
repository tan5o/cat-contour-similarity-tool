import { describe, it, expect } from 'vitest';
import { extractContour, getLargestContour } from '../lib/contour';

function createMask(
  width: number,
  height: number,
  fill: (x: number, y: number) => boolean
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (fill(x, y)) {
        mask[y * width + x] = 255;
      }
    }
  }
  return mask;
}

describe('extractContour (marching squares)', () => {
  it('空のマスクでは輪郭が見つからない', () => {
    const mask = new Uint8Array(10 * 10);
    const contours = extractContour(mask, 10, 10);
    expect(contours.length).toBe(0);
  });

  it('単純な矩形の輪郭を抽出する', () => {
    const width = 20;
    const height = 20;
    const rectW = 6;
    const rectH = 4;
    const startX = 7;
    const startY = 8;

    const mask = createMask(
      width,
      height,
      (x, y) => x >= startX && x < startX + rectW && y >= startY && y < startY + rectH
    );

    const contours = extractContour(mask, width, height);
    const largest = getLargestContour(contours);
    expect(largest).not.toBeNull();

    const area = largest?.area ?? 0;
    const perimeter = largest?.perimeter ?? 0;

    expect(area).toBeGreaterThan(0);
    expect(perimeter).toBeGreaterThan(0);
    expect(Math.abs(area - rectW * rectH)).toBeLessThan(2);
    expect(Math.abs(perimeter - 2 * (rectW + rectH))).toBeLessThan(4);
  });
});
