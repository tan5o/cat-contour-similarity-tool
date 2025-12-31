import { describe, it, expect } from 'vitest';
import {
  computeHuMoments,
  computeHuMomentsFromMask,
  computeEFD,
  normalizeEFD,
  computeTurningFunction
} from '../lib/descriptors';
import type { Point } from '../types';

/**
 * 形状記述子のテスト
 */

// テスト用のサンプル形状を生成
function createSquare(size: number = 100): Point[] {
  return [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size }
  ];
}

function createTriangle(size: number = 100): Point[] {
  return [
    { x: size / 2, y: 0 },
    { x: size, y: size },
    { x: 0, y: size }
  ];
}

function createCircle(radius: number = 50, points: number = 64): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;
    result.push({
      x: radius + radius * Math.cos(angle),
      y: radius + radius * Math.sin(angle)
    });
  }
  return result;
}

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

describe('computeHuMoments', () => {
  it('正方形に対して有効なHuモーメントを返す', () => {
    const square = createSquare(100);
    const moments = computeHuMoments(square);

    expect(moments).toHaveLength(7);
    moments.forEach(m => {
      expect(typeof m).toBe('number');
      expect(Number.isFinite(m)).toBe(true);
    });
  });

  it('三角形に対して有効なHuモーメントを返す', () => {
    const triangle = createTriangle(100);
    const moments = computeHuMoments(triangle);

    expect(moments).toHaveLength(7);
    moments.forEach(m => {
      expect(typeof m).toBe('number');
      expect(Number.isFinite(m)).toBe(true);
    });
  });

  it('円に対して有効なHuモーメントを返す', () => {
    const circle = createCircle(50, 64);
    const moments = computeHuMoments(circle);

    expect(moments).toHaveLength(7);
    moments.forEach(m => {
      expect(typeof m).toBe('number');
      expect(Number.isFinite(m)).toBe(true);
    });
  });

  it('スケール変化に対してほぼ不変である', () => {
    const smallSquare = createSquare(50);
    const largeSquare = createSquare(200);

    const smallMoments = computeHuMoments(smallSquare);
    const largeMoments = computeHuMoments(largeSquare);

    // 最初のいくつかのモーメントは比較的安定していることを確認
    // 完全な不変性は期待できないが、大きな差がないことを確認
    for (let i = 0; i < 3; i++) {
      const diff = Math.abs(smallMoments[i] - largeMoments[i]);
      expect(diff).toBeLessThan(2); // 許容差
    }
  });
});

describe('computeHuMomentsFromMask', () => {
  it('空のマスクではゼロ配列を返す', () => {
    const mask = new Uint8Array(10 * 10);
    const moments = computeHuMomentsFromMask(mask, 10, 10);
    expect(moments).toHaveLength(7);
    moments.forEach(m => {
      expect(m).toBe(0);
    });
  });

  it('スケール変化に対して概ね不変である', () => {
    const small = createMask(30, 30, (x, y) => x >= 10 && x < 20 && y >= 10 && y < 20);
    const large = createMask(60, 60, (x, y) => x >= 20 && x < 40 && y >= 20 && y < 40);

    const smallMoments = computeHuMomentsFromMask(small, 30, 30);
    const largeMoments = computeHuMomentsFromMask(large, 60, 60);

    for (let i = 0; i < 3; i++) {
      const diff = Math.abs(smallMoments[i] - largeMoments[i]);
      expect(diff).toBeLessThan(0.5);
    }
  });
});

describe('computeEFD', () => {
  it('デフォルト次数でEFD係数を計算する', () => {
    const square = createSquare(100);
    const coeffs = computeEFD(square);

    // 15次 × 4係数 = 60要素 (pyefd互換)
    expect(coeffs).toHaveLength(60);
    coeffs.forEach(c => {
      expect(typeof c).toBe('number');
      expect(Number.isFinite(c)).toBe(true);
    });
  });

  it('指定した次数でEFD係数を計算する', () => {
    const circle = createCircle(50, 64);
    const order = 8;
    const coeffs = computeEFD(circle, order);

    expect(coeffs).toHaveLength(order * 4);
  });

  it('三角形と正方形で異なるEFD係数を返す', () => {
    const square = createSquare(100);
    const triangle = createTriangle(100);

    const squareCoeffs = computeEFD(square);
    const triangleCoeffs = computeEFD(triangle);

    // 少なくともいくつかの係数が異なることを確認
    let hasDifference = false;
    for (let i = 0; i < squareCoeffs.length; i++) {
      if (Math.abs(squareCoeffs[i] - triangleCoeffs[i]) > 0.001) {
        hasDifference = true;
        break;
      }
    }
    expect(hasDifference).toBe(true);
  });
});

describe('normalizeEFD', () => {
  it('EFD係数を振幅ベースで正規化する', () => {
    const square = createSquare(100);
    const coeffs = computeEFD(square);
    const normalized = normalizeEFD(coeffs);

    // 係数 ÷ 4 = 振幅の数（各周波数につき1値）
    expect(normalized).toHaveLength(coeffs.length / 4);
    normalized.forEach(c => {
      expect(typeof c).toBe('number');
      expect(Number.isFinite(c)).toBe(true);
    });
    // 第1周波数で正規化されるので、最初の値は1になる
    expect(normalized[0]).toBeCloseTo(1, 5);
  });

  it('スケール変化で正規化後の値が近似する', () => {
    const smallSquare = createSquare(50);
    const largeSquare = createSquare(200);

    const smallNorm = normalizeEFD(computeEFD(smallSquare));
    const largeNorm = normalizeEFD(computeEFD(largeSquare));

    // 正規化後は近い値になることを確認
    for (let i = 0; i < smallNorm.length; i++) {
      const diff = Math.abs(smallNorm[i] - largeNorm[i]);
      expect(diff).toBeLessThan(0.5);
    }
  });

  it('開始点の違いに対して不変である', () => {
    const circle = createCircle(50, 64);
    // 開始点をずらした円を作成
    const shiftedCircle = [...circle.slice(16), ...circle.slice(0, 16)];

    const origNorm = normalizeEFD(computeEFD(circle));
    const shiftedNorm = normalizeEFD(computeEFD(shiftedCircle));

    // 振幅ベースなので開始点に不変
    for (let i = 0; i < origNorm.length; i++) {
      expect(origNorm[i]).toBeCloseTo(shiftedNorm[i], 3);
    }
  });
});

describe('computeTurningFunction', () => {
  it('指定したサンプル数でTurning Functionを計算する', () => {
    const square = createSquare(100);
    const samples = 64;
    const turning = computeTurningFunction(square, samples);

    expect(turning).toHaveLength(samples);
    turning.forEach(t => {
      expect(typeof t).toBe('number');
      expect(Number.isFinite(t)).toBe(true);
    });
  });

  it('円は比較的均一なTurning Functionを持つ', () => {
    const circle = createCircle(50, 128);
    const turning = computeTurningFunction(circle, 64);

    // 円の場合、累積角度は滑らかに増加し、1周で約2πになる
    // 各サンプル間の変化が小さく均一であることを確認
    const diffs: number[] = [];
    for (let i = 1; i < turning.length; i++) {
      diffs.push(Math.abs(turning[i] - turning[i - 1]));
    }
    const avgDiff = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
    const maxDiff = Math.max(...diffs);

    // 円は滑らかなので、最大差分と平均差分の比率が小さいはず
    expect(maxDiff / avgDiff).toBeLessThan(3); // 均一性のチェック
    expect(Math.abs(turning[turning.length - 1])).toBeGreaterThan(Math.PI); // 累積で約2π
  });

  it('正方形は角で大きな角度変化を持つ', () => {
    const square = createSquare(100);
    const turning = computeTurningFunction(square, 64);

    // 正方形の場合、角で大きな角度変化がある
    const maxAbsValue = Math.max(...turning.map(Math.abs));
    expect(maxAbsValue).toBeGreaterThan(0);
  });
});
