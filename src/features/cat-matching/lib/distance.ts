function wrapAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * 2つの特徴ベクトル間のL2（ユークリッド）距離を計算する。
 * @param a ベクトルA
 * @param b ベクトルB
 * @returns L2距離
 */
export function l2Distance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Feature vectors must have same length');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * 2つの特徴ベクトル間のL1（マンハッタン）距離を計算する。
 * @param a ベクトルA
 * @param b ベクトルB
 * @returns L1距離
 */
export function l1Distance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Feature vectors must have same length');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i]);
  }

  return sum;
}

/**
 * 累積角度列の循環L1距離を計算する。
 * シフト後に0リベース（最初の値を0にする）することで、
 * 開始点の違いによる定数オフセット問題を解消。
 * また、差分を[-π,π]にwrapして2π跨ぎでの過大評価を防ぐ。
 * @param a 累積角度列A
 * @param b 累積角度列B
 * @returns 循環L1距離
 */
export function cyclicL1Distance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Feature vectors must have same length');
  }
  const n = a.length;
  if (n === 0) return 0;

  // aを0リベース（最初の値を基準に引く）
  const aBase = a[0];
  const aRebased = a.map(v => v - aBase);

  let best = Infinity;
  for (let shift = 0; shift < n; shift++) {
    // シフトしたb列を作成し、0リベース
    const bShiftBase = b[shift];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const bVal = b[(i + shift) % n] - bShiftBase;
      // 角度差を[-π,π]にwrapしてから絶対値を取る
      const diff = wrapAngle(aRebased[i] - bVal);
      sum += Math.abs(diff);
      if (sum >= best) break;
    }
    if (sum < best) best = sum;
  }

  return best;
}
