import { describe, it, expect, beforeEach } from 'vitest';
import { findMatches, formatScore, getMatchDescription } from '../lib/match';
import { buildKnnFeatures } from '../lib/descriptors';
import type { ContourFeatures, PrefectureFeature, MatchResult } from '../types';

/**
 * マッチング処理のテスト
 */

// テスト用のダミー特徴量を生成
function createDummyFeatures(seed: number = 0): ContourFeatures {
  const efd = Array(64)
    .fill(0)
    .map((_, i) => Math.sin(i + seed) * 0.1);
  const turning = Array(128)
    .fill(0)
    .map((_, i) => Math.cos(i + seed) * 0.05);
  const huMoments = [0.1 + seed * 0.01, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
  const circularity = 0.6 + seed * 0.001;
  const convexity = 0.9 - seed * 0.0005;
  const solidity = 0.8 - seed * 0.0007;
  const radialFft = Array(16)
    .fill(0)
    .map((_, i) => Math.abs(Math.sin(i + seed)) * 0.1);
  const knnFeatures = buildKnnFeatures({
    efd,
    turning,
    huMoments,
    circularity,
    convexity,
    solidity,
    radialFft
  });
  return { efd, turning, huMoments, circularity, convexity, solidity, radialFft, knnFeatures };
}

function createDummyPrefecture(code: string, name: string, seed: number): PrefectureFeature {
  return {
    code,
    name,
    nameEn: name.toLowerCase(),
    features: createDummyFeatures(seed),
    outline: [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 }
    ]
  };
}

describe('findMatches', () => {
  let prefectures: PrefectureFeature[];
  let queryFeatures: ContourFeatures;

  beforeEach(() => {
    // テスト用の都道府県データを準備
    prefectures = [
      createDummyPrefecture('01', '北海道', 1),
      createDummyPrefecture('02', '青森', 2),
      createDummyPrefecture('03', '岩手', 3),
      createDummyPrefecture('04', '宮城', 4),
      createDummyPrefecture('05', '秋田', 5)
    ];
    queryFeatures = createDummyFeatures(1.5);
  });

  it('指定した件数の結果を返す', () => {
    const results = findMatches(queryFeatures, prefectures, 3);
    expect(results).toHaveLength(3);
  });

  it('結果がスコア順にソートされている', () => {
    const results = findMatches(queryFeatures, prefectures, 5);

    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i + 1].score);
    }
  });

  it('各結果に必要なプロパティが含まれている', () => {
    const results = findMatches(queryFeatures, prefectures, 3);

    results.forEach(result => {
      expect(result).toHaveProperty('prefCode');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('nameEn');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('weights');
      expect(result).toHaveProperty('breakdown');
    });
  });

  it('空の都道府県リストに対して空の結果を返す', () => {
    const results = findMatches(queryFeatures, [], 5);
    expect(results).toHaveLength(0);
  });

  it('topNが都道府県数を超える場合、全都道府県を返す', () => {
    const results = findMatches(queryFeatures, prefectures, 100);
    expect(results).toHaveLength(prefectures.length);
  });

  it('重みを変更すると結果が変わる可能性がある', () => {
    const results1 = findMatches(queryFeatures, prefectures, 5, 0.5, 0.1, 0.1, 0.1, 0.1, 0.1);
    const results2 = findMatches(queryFeatures, prefectures, 5, 0.1, 0.5, 0.1, 0.1, 0.1, 0.1);

    // スコアが異なることを確認
    const scores1 = results1.map(r => r.score);
    const scores2 = results2.map(r => r.score);

    // 少なくとも一つのスコアが異なることを確認
    let hasDifference = false;
    for (let i = 0; i < scores1.length; i++) {
      if (Math.abs(scores1[i] - scores2[i]) > 0.001) {
        hasDifference = true;
        break;
      }
    }
    expect(hasDifference).toBe(true);
  });
});

describe('formatScore', () => {
  it('スコア0に対して100%を返す', () => {
    const formatted = formatScore(0);
    expect(parseFloat(formatted)).toBeCloseTo(100, 0);
  });

  it('スコアが大きいほど低いパーセンテージを返す', () => {
    const score1 = parseFloat(formatScore(0.1));
    const score2 = parseFloat(formatScore(1.0));
    const score3 = parseFloat(formatScore(10.0));

    expect(score1).toBeGreaterThan(score2);
    expect(score2).toBeGreaterThan(score3);
  });

  it('有効な数値文字列を返す', () => {
    const formatted = formatScore(0.5);
    expect(Number.isFinite(parseFloat(formatted))).toBe(true);
  });
});

describe('getMatchDescription', () => {
  it('回転なし、スケール1.0の場合は空文字を返す', () => {
    const match: MatchResult = {
      prefCode: '01',
      name: '北海道',
      nameEn: 'hokkaido',
      score: 0.1,
      weights: {
        efd: 0.02,
        turning: 0.15,
        hu: 0.08,
        roughness: 0.3,
        peak: 0.25,
        spread: 0.2,
        circularity: 0.05,
        convexity: 0.05,
        solidity: 0.05,
        radialFft: 0.1,
        knn: 0.1,
        cnn: 0.6,
        smoothPenalty: 0.8,
        baseSmoothPenalty: 0.6
      },
      breakdown: {
        weighted: {
          efd: 0,
          turning: 0,
          hu: 0,
          roughness: 0,
          peak: 0,
          spread: 0,
          circularity: 0,
          convexity: 0,
          solidity: 0,
          radialFft: 0,
          knn: 0,
          cnn: 0,
          smoothPenalty: 0,
          baseSmoothPenalty: 0
        },
        normalized: {
          efd: 0,
          turning: 0,
          hu: 0,
          roughness: 0,
          peak: 0,
          spread: 0,
          circularity: 0,
          convexity: 0,
          solidity: 0,
          radialFft: 0,
          knn: 0,
          cnn: 0,
          smoothPenalty: 0,
          baseSmoothPenalty: 0
        },
        weights: {
          efd: 0.02,
          turning: 0.15,
          hu: 0.08,
          roughness: 0.3,
          peak: 0.25,
          spread: 0.2,
          circularity: 0.05,
          convexity: 0.05,
          solidity: 0.05,
          radialFft: 0.1,
          knn: 0.1,
          cnn: 0.6,
          smoothPenalty: 0,
          baseSmoothPenalty: 0
        }
      },
      align: { rotationDeg: 0, scale: 1.0 },
      outline: []
    };

    expect(getMatchDescription(match)).toBe('');
  });

  it('回転がある場合、回転角度を含む説明を返す', () => {
    const match: MatchResult = {
      prefCode: '01',
      name: '北海道',
      nameEn: 'hokkaido',
      score: 0.1,
      weights: {
        efd: 0.02,
        turning: 0.15,
        hu: 0.08,
        roughness: 0.3,
        peak: 0.25,
        spread: 0.2,
        circularity: 0.05,
        convexity: 0.05,
        solidity: 0.05,
        radialFft: 0.1,
        knn: 0.1,
        cnn: 0.6,
        smoothPenalty: 0.8,
        baseSmoothPenalty: 0.6
      },
      breakdown: {
        weighted: {
          efd: 0,
          turning: 0,
          hu: 0,
          roughness: 0,
          peak: 0,
          spread: 0,
          circularity: 0,
          convexity: 0,
          solidity: 0,
          radialFft: 0,
          knn: 0,
          cnn: 0,
          smoothPenalty: 0,
          baseSmoothPenalty: 0
        },
        normalized: {
          efd: 0,
          turning: 0,
          hu: 0,
          roughness: 0,
          peak: 0,
          spread: 0,
          circularity: 0,
          convexity: 0,
          solidity: 0,
          radialFft: 0,
          knn: 0,
          cnn: 0,
          smoothPenalty: 0,
          baseSmoothPenalty: 0
        },
        weights: {
          efd: 0.02,
          turning: 0.15,
          hu: 0.08,
          roughness: 0.3,
          peak: 0.25,
          spread: 0.2,
          circularity: 0.05,
          convexity: 0.05,
          solidity: 0.05,
          radialFft: 0.1,
          knn: 0.1,
          cnn: 0.6,
          smoothPenalty: 0,
          baseSmoothPenalty: 0
        }
      },
      align: { rotationDeg: 45, scale: 1.0 },
      outline: []
    };

    const desc = getMatchDescription(match);
    expect(desc).toContain('45');
    expect(desc).toContain('回転');
  });

  it('スケールが1でない場合、スケール情報を含む説明を返す', () => {
    const match: MatchResult = {
      prefCode: '01',
      name: '北海道',
      nameEn: 'hokkaido',
      score: 0.1,
      weights: {
        efd: 0.02,
        turning: 0.15,
        hu: 0.08,
        roughness: 0.3,
        peak: 0.25,
        spread: 0.2,
        circularity: 0.05,
        convexity: 0.05,
        solidity: 0.05,
        radialFft: 0.1,
        knn: 0.1,
        cnn: 0.6,
        smoothPenalty: 0.8,
        baseSmoothPenalty: 0.6
      },
      breakdown: {
        weighted: {
          efd: 0,
          turning: 0,
          hu: 0,
          roughness: 0,
          peak: 0,
          spread: 0,
          circularity: 0,
          convexity: 0,
          solidity: 0,
          radialFft: 0,
          knn: 0,
          cnn: 0,
          smoothPenalty: 0,
          baseSmoothPenalty: 0
        },
        normalized: {
          efd: 0,
          turning: 0,
          hu: 0,
          roughness: 0,
          peak: 0,
          spread: 0,
          circularity: 0,
          convexity: 0,
          solidity: 0,
          radialFft: 0,
          knn: 0,
          cnn: 0,
          smoothPenalty: 0,
          baseSmoothPenalty: 0
        },
        weights: {
          efd: 0.02,
          turning: 0.15,
          hu: 0.08,
          roughness: 0.3,
          peak: 0.25,
          spread: 0.2,
          circularity: 0.05,
          convexity: 0.05,
          solidity: 0.05,
          radialFft: 0.1,
          knn: 0.1,
          cnn: 0.6,
          smoothPenalty: 0,
          baseSmoothPenalty: 0
        }
      },
      align: { rotationDeg: 0, scale: 1.2 },
      outline: []
    };

    const desc = getMatchDescription(match);
    expect(desc).toContain('拡大');
  });
});
