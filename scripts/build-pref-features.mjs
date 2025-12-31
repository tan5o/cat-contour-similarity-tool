#!/usr/bin/env node

/**
 * Build prefecture features from GeoJSON
 *
 * This script processes a GeoJSON file containing Japanese prefecture boundaries,
 * extracts and normalizes their contours, computes shape descriptors (EFD and Turning Function),
 * and outputs the features to a JSON file for runtime matching.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefecture data (47 prefectures)
const PREFECTURES = [
  { code: '01', name: '北海道', nameEn: 'Hokkaido' },
  { code: '02', name: '青森県', nameEn: 'Aomori' },
  { code: '03', name: '岩手県', nameEn: 'Iwate' },
  { code: '04', name: '宮城県', nameEn: 'Miyagi' },
  { code: '05', name: '秋田県', nameEn: 'Akita' },
  { code: '06', name: '山形県', nameEn: 'Yamagata' },
  { code: '07', name: '福島県', nameEn: 'Fukushima' },
  { code: '08', name: '茨城県', nameEn: 'Ibaraki' },
  { code: '09', name: '栃木県', nameEn: 'Tochigi' },
  { code: '10', name: '群馬県', nameEn: 'Gunma' },
  { code: '11', name: '埼玉県', nameEn: 'Saitama' },
  { code: '12', name: '千葉県', nameEn: 'Chiba' },
  { code: '13', name: '東京都', nameEn: 'Tokyo' },
  { code: '14', name: '神奈川県', nameEn: 'Kanagawa' },
  { code: '15', name: '新潟県', nameEn: 'Niigata' },
  { code: '16', name: '富山県', nameEn: 'Toyama' },
  { code: '17', name: '石川県', nameEn: 'Ishikawa' },
  { code: '18', name: '福井県', nameEn: 'Fukui' },
  { code: '19', name: '山梨県', nameEn: 'Yamanashi' },
  { code: '20', name: '長野県', nameEn: 'Nagano' },
  { code: '21', name: '岐阜県', nameEn: 'Gifu' },
  { code: '22', name: '静岡県', nameEn: 'Shizuoka' },
  { code: '23', name: '愛知県', nameEn: 'Aichi' },
  { code: '24', name: '三重県', nameEn: 'Mie' },
  { code: '25', name: '滋賀県', nameEn: 'Shiga' },
  { code: '26', name: '京都府', nameEn: 'Kyoto' },
  { code: '27', name: '大阪府', nameEn: 'Osaka' },
  { code: '28', name: '兵庫県', nameEn: 'Hyogo' },
  { code: '29', name: '奈良県', nameEn: 'Nara' },
  { code: '30', name: '和歌山県', nameEn: 'Wakayama' },
  { code: '31', name: '鳥取県', nameEn: 'Tottori' },
  { code: '32', name: '島根県', nameEn: 'Shimane' },
  { code: '33', name: '岡山県', nameEn: 'Okayama' },
  { code: '34', name: '広島県', nameEn: 'Hiroshima' },
  { code: '35', name: '山口県', nameEn: 'Yamaguchi' },
  { code: '36', name: '徳島県', nameEn: 'Tokushima' },
  { code: '37', name: '香川県', nameEn: 'Kagawa' },
  { code: '38', name: '愛媛県', nameEn: 'Ehime' },
  { code: '39', name: '高知県', nameEn: 'Kochi' },
  { code: '40', name: '福岡県', nameEn: 'Fukuoka' },
  { code: '41', name: '佐賀県', nameEn: 'Saga' },
  { code: '42', name: '長崎県', nameEn: 'Nagasaki' },
  { code: '43', name: '熊本県', nameEn: 'Kumamoto' },
  { code: '44', name: '大分県', nameEn: 'Oita' },
  { code: '45', name: '宮崎県', nameEn: 'Miyazaki' },
  { code: '46', name: '鹿児島県', nameEn: 'Kagoshima' },
  { code: '47', name: '沖縄県', nameEn: 'Okinawa' }
];

// Geometry functions (simplified versions from lib)

function calculateCentroid(points) {
  const n = points.length;
  let cx = 0,
    cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / n, y: cy / n };
}

function centerContour(points) {
  const centroid = calculateCentroid(points);
  return points.map(p => ({
    x: p.x - centroid.x,
    y: p.y - centroid.y
  }));
}

function scaleContour(points) {
  let maxDist = 0;
  for (const p of points) {
    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    if (dist > maxDist) maxDist = dist;
  }
  if (maxDist === 0) return points;
  return points.map(p => ({
    x: p.x / maxDist,
    y: p.y / maxDist
  }));
}

function alignContourPCA(points) {
  const n = points.length;
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const p of points) {
    xx += p.x * p.x;
    yy += p.y * p.y;
    xy += p.x * p.y;
  }
  xx /= n;
  yy /= n;
  xy /= n;

  const trace = xx + yy;
  const det = xx * yy - xy * xy;
  const lambda1 = trace / 2 + Math.sqrt((trace * trace) / 4 - det);

  let vx = xy;
  let vy = lambda1 - xx;
  const norm = Math.sqrt(vx * vx + vy * vy);

  if (norm > 0) {
    vx /= norm;
    vy /= norm;
  } else {
    vx = 1;
    vy = 0;
  }

  const rotation = Math.atan2(vy, vx);
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);

  return points.map(p => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos
  }));
}

function resampleContour(points, numPoints) {
  if (points.length < 2) return points;

  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    distances.push(distances[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }

  const dx = points[0].x - points[points.length - 1].x;
  const dy = points[0].y - points[points.length - 1].y;
  const totalLength = distances[distances.length - 1] + Math.sqrt(dx * dx + dy * dy);

  const resampled = [];
  const stepLength = totalLength / numPoints;

  for (let i = 0; i < numPoints; i++) {
    const targetDist = i * stepLength;
    let segIdx = 0;
    for (let j = 1; j < distances.length; j++) {
      if (distances[j] > targetDist) {
        segIdx = j - 1;
        break;
      }
    }

    const t = (targetDist - distances[segIdx]) / (distances[segIdx + 1] - distances[segIdx]);
    const p1 = points[segIdx];
    const p2 = points[segIdx + 1] || points[0];

    resampled.push({
      x: p1.x + t * (p2.x - p1.x),
      y: p1.y + t * (p2.y - p1.y)
    });
  }

  return resampled;
}

const NORMALIZED_CONTOUR_SIZE = 128;

function normalizeContour(points, numSamplePoints = NORMALIZED_CONTOUR_SIZE) {
  let centered = centerContour(points);
  let scaled = scaleContour(centered);
  let aligned = alignContourPCA(scaled);
  let resampled = resampleContour(aligned, numSamplePoints);
  return resampled;
}

/**
 * 等間隔（弧長パラメータ）でリサンプリングする（EFD用）
 */
function resampleClosed(points, n = 256) {
  if (points.length < 5) return points;

  // 閉曲線として扱うため、最初と最後が異なれば閉じる
  const pts = points.slice();
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first.x !== last.x || first.y !== last.y) {
    pts.push({ x: first.x, y: first.y });
  }

  // 各セグメントの長さと累積長を計算
  const segLen = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const d = Math.hypot(dx, dy);
    segLen.push(d);
    total += d;
  }
  if (total < 1e-8) return pts;

  const out = [];
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
 * 楕円フーリエ記述子（EFD）を計算する（pyefd互換の弧長パラメータ版）
 * ノートブックと同じ: order=15, numSamples=128
 */
function computeEFD(pointsIn, order = 15, numSamples = 128) {
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

  const coeffs = [];
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
 */
function normalizeEFDPyefd(coeffs) {
  if (coeffs.length < 4) return coeffs;

  const order = coeffs.length / 4;
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
 * 振幅ベースのEFD正規化（従来方式、互換性のため残す）
 */
function normalizeEFD(coeffs) {
  if (coeffs.length < 4) return coeffs;

  // 各周波数の振幅を計算: sqrt(a^2 + b^2 + c^2 + d^2)
  const magnitudes = [];
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

function computeTurningFunction(points, numSamples = 128) {
  const n = points.length;
  const angles = [];

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const angle1 = Math.atan2(dy1, dx1);
    const angle2 = Math.atan2(dy2, dx2);

    let angle = angle2 - angle1;
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;

    angles.push(angle);
  }

  const resampled = [];
  const step = angles.length / numSamples;

  for (let i = 0; i < numSamples; i++) {
    const idx = Math.floor(i * step);
    resampled.push(angles[idx]);
  }

  return resampled;
}

const TURNING_SMOOTH_WINDOW = 9;
const TURNING_SMOOTH_PASSES = 2;

function smoothContourPoints(
  points,
  windowSize = TURNING_SMOOTH_WINDOW,
  passes = TURNING_SMOOTH_PASSES
) {
  if (points.length === 0) return points;
  let current = points;
  for (let pass = 0; pass < passes; pass++) {
    const half = Math.floor(windowSize / 2);
    const smoothed = [];
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

function computeHuMoments(points) {
  const n = points.length;
  let m00 = 0,
    m10 = 0,
    m01 = 0;
  let m20 = 0,
    m11 = 0,
    m02 = 0;
  let m30 = 0,
    m21 = 0,
    m12 = 0,
    m03 = 0;

  for (const p of points) {
    const x = p.x,
      y = p.y;
    const x2 = x * x,
      y2 = y * y;
    const x3 = x2 * x,
      y3 = y2 * y;

    m00 += 1;
    m10 += x;
    m01 += y;
    m20 += x2;
    m11 += x * y;
    m02 += y2;
    m30 += x3;
    m21 += x2 * y;
    m12 += x * y2;
    m03 += y3;
  }

  const xc = m10 / m00,
    yc = m01 / m00;
  let mu20 = 0,
    mu11 = 0,
    mu02 = 0;
  let mu30 = 0,
    mu21 = 0,
    mu12 = 0,
    mu03 = 0;

  for (const p of points) {
    const x = p.x - xc,
      y = p.y - yc;
    const x2 = x * x,
      y2 = y * y;
    const x3 = x2 * x,
      y3 = y2 * y;

    mu20 += x2;
    mu11 += x * y;
    mu02 += y2;
    mu30 += x3;
    mu21 += x2 * y;
    mu12 += x * y2;
    mu03 += y3;
  }

  const norm = Math.pow(m00, 2);
  const n20 = mu20 / norm,
    n11 = mu11 / norm,
    n02 = mu02 / norm;
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

function polygonArea(points) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function polygonPerimeter(points) {
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

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function convexHull(points) {
  if (points.length <= 1) return points.slice();
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
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

function centroid(points) {
  if (points.length === 0) return { x: 0, y: 0 };
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  return { x: sumX / points.length, y: sumY / points.length };
}

function computeRadialFft(points, bins = 16) {
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
  const magnitudes = [];

  for (let k = 1; k <= maxBins; k++) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * k * t) / n;
      re += normalized[t] * Math.cos(angle);
      im -= normalized[t] * Math.sin(angle);
    }
    const mag = Math.sqrt(re * re + im * im) / n;
    magnitudes.push(mag);
  }

  return magnitudes;
}

function computeFeatures(points, efdOrder = 15, turningSize = 128) {
  const efdCoeffs = computeEFD(points, efdOrder);
  // pyefd互換: 係数を正規化してflatten（60個）
  const efd = normalizeEFDPyefd(efdCoeffs);
  const turningPoints = smoothContourPoints(points);
  const turning = computeTurningFunction(turningPoints, turningSize);
  const huMoments = computeHuMoments(points);
  const area = polygonArea(points);
  const perimeter = polygonPerimeter(points);
  const hull = convexHull(points);
  const hullArea = polygonArea(hull);
  const hullPerimeter = polygonPerimeter(hull);
  const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
  const convexity = perimeter > 0 ? hullPerimeter / perimeter : 0;
  const solidity = hullArea > 0 ? area / hullArea : 0;
  const radialFft = computeRadialFft(points, 16);
  // knnFeaturesは後で標準化してから追加
  return { efd, turning, huMoments, circularity, convexity, solidity, radialFft };
}

/**
 * KNN特徴量の生ベクトルを構築（標準化前）
 */
function buildKnnFeaturesRaw(features) {
  const turning = features.turning;
  const turningBase = turning.length > 0 ? turning[0] : 0;
  const normalizedTurning = turning.map(v => (v - turningBase) / Math.PI);
  const circularity = Number.isFinite(features.circularity) ? features.circularity : 0;
  const convexity = Number.isFinite(features.convexity) ? features.convexity : 0;
  const solidity = Number.isFinite(features.solidity) ? features.solidity : 0;

  return [
    ...features.efd,
    ...normalizedTurning,
    ...features.huMoments,
    circularity,
    convexity,
    solidity,
    ...features.radialFft
  ];
}

/**
 * 標準化用の統計量を計算
 */
function computeKnnStandardization(allFeatures) {
  if (allFeatures.length === 0) {
    return { mean: [], std: [], dimensions: 0 };
  }

  const rawVectors = allFeatures.map(f => buildKnnFeaturesRaw(f));
  const dimensions = rawVectors[0].length;
  const n = rawVectors.length;

  // 各次元の平均を計算
  const mean = new Array(dimensions).fill(0);
  for (const vec of rawVectors) {
    for (let i = 0; i < dimensions; i++) {
      mean[i] += vec[i];
    }
  }
  for (let i = 0; i < dimensions; i++) {
    mean[i] /= n;
  }

  // 各次元の標準偏差を計算
  const std = new Array(dimensions).fill(0);
  for (const vec of rawVectors) {
    for (let i = 0; i < dimensions; i++) {
      const diff = vec[i] - mean[i];
      std[i] += diff * diff;
    }
  }
  for (let i = 0; i < dimensions; i++) {
    std[i] = Math.sqrt(std[i] / n);
    // 標準偏差が0の場合は1にして除算エラーを防ぐ
    if (std[i] < 1e-10) std[i] = 1;
  }

  return { mean, std, dimensions };
}

/**
 * 標準化されたKNN特徴量を構築
 */
function buildKnnFeatures(features, standardization) {
  const raw = buildKnnFeaturesRaw(features);

  if (!standardization || standardization.mean.length !== raw.length) {
    return raw;
  }

  // 標準化: (x - mean) / std
  return raw.map((v, i) => (v - standardization.mean[i]) / standardization.std[i]);
}

// Main processing

function extractLargestPolygon(geometry) {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates[0];
  } else if (geometry.type === 'MultiPolygon') {
    let largest = geometry.coordinates[0][0];
    let maxArea = calculatePolygonArea(largest);

    for (let i = 1; i < geometry.coordinates.length; i++) {
      const poly = geometry.coordinates[i][0];
      const area = calculatePolygonArea(poly);
      if (area > maxArea) {
        maxArea = area;
        largest = poly;
      }
    }

    return largest;
  }

  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function calculatePolygonArea(coords) {
  let area = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    area += coords[i][0] * coords[i + 1][1];
    area -= coords[i + 1][0] * coords[i][1];
  }
  return Math.abs(area) / 2;
}

function coordinatesToPoints(coords) {
  return coords.map(c => ({ x: c[0], y: c[1] }));
}

// For MVP: Generate synthetic prefecture contours (fallback)
function generateSyntheticPrefecture(code) {
  // Generate a simple shape based on prefecture code
  const numPoints = 64;
  const points = [];
  const seed = parseInt(code);

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    // Create some variation using the seed
    const r = 1 + 0.3 * Math.sin(angle * (2 + (seed % 5)));
    points.push({
      x: r * Math.cos(angle),
      y: r * Math.sin(angle)
    });
  }

  return points;
}

function createPreviewOutline(points, numSamplePoints = 128) {
  if (points.length < 3) return points;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const maxDim = Math.max(dx, dy) || 1;
  const scale = 1 / maxDim;
  const width = dx * scale;
  const height = dy * scale;
  const padX = (1 - width) / 2;
  const padY = (1 - height) / 2;

  // Convert lon/lat into a unit box for UI preview while preserving aspect ratio.
  // - X: east is right
  // - Y: north is up (invert latitude)
  const scaled = points.map(p => ({
    x: (p.x - minX) * scale + padX,
    y: (maxY - p.y) * scale + padY
  }));

  const resampled = resampleContour(scaled, numSamplePoints);
  return resampled.map(p => ({
    x: Math.round(p.x * 10000) / 10000,
    y: Math.round(p.y * 10000) / 10000
  }));
}

function loadCnnEmbeddings() {
  const embeddingsPath = path.join(__dirname, '../public/assets/cnn_embeddings.json');
  if (!fs.existsSync(embeddingsPath)) {
    console.warn('cnn_embeddings.json not found. Skip CNN embedding merge.');
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));
  } catch (error) {
    console.warn('Failed to read cnn_embeddings.json. Skip CNN embedding merge.', error);
    return null;
  }
}

async function buildPrefectureFeatures() {
  console.log('Building prefecture features...');

  const prefectureData = [];
  const cnnEmbeddings = loadCnnEmbeddings();
  const localGeojsonPath = path.join(__dirname, '../japan.geojson');
  const vendorGeojsonPath = path.join(__dirname, '../vendor/dataofjapan-land/japan.geojson');
  const geojsonPath = fs.existsSync(localGeojsonPath) ? localGeojsonPath : vendorGeojsonPath;
  if (!fs.existsSync(geojsonPath)) {
    console.error(`GeoJSON not found: ${geojsonPath}`);
    console.error('Did you initialize submodules?');
    console.error('  git submodule update --init --recursive');
    process.exit(1);
  }
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8'));
  const featureByPref = new Map((geojson.features || []).map(f => [f?.properties?.id, f]));

  // 1st pass: compute basic features for all prefectures
  for (const pref of PREFECTURES) {
    console.log(`Processing ${pref.name}...`);

    try {
      const geo = featureByPref.get(parseInt(pref.code, 10));
      let coords;
      if (geo?.geometry) {
        const largest = extractLargestPolygon(geo.geometry);
        coords = coordinatesToPoints(largest);
      } else {
        console.warn(`  GeoJSON feature not found, using synthetic data`);
        coords = generateSyntheticPrefecture(pref.code);
      }

      // Normalize contour
      const normalized = normalizeContour(coords, NORMALIZED_CONTOUR_SIZE);

      // Compute features (without knnFeatures yet)
      // pyefd互換: order=15, turningSize=128
      const featureVectors = computeFeatures(normalized, 15, 128);
      if (cnnEmbeddings) {
        const byName = cnnEmbeddings[pref.name];
        const byCode = cnnEmbeddings[pref.code];
        const embedding = Array.isArray(byName) ? byName : Array.isArray(byCode) ? byCode : null;
        if (embedding) {
          featureVectors.cnnEmbedding = embedding;
        }
      }
      const outline = createPreviewOutline(coords, 128);

      prefectureData.push({
        code: pref.code,
        name: pref.name,
        nameEn: pref.nameEn,
        features: featureVectors,
        outline
      });
    } catch (error) {
      console.error(`Failed to process ${pref.name}:`, error);
    }
  }

  const output = {
    version: 3,
    prefectures: prefectureData
  };

  // Write output
  const outputPath = path.join(__dirname, '../public/assets/pref_features.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\nSuccessfully processed ${prefectureData.length} prefectures`);
  console.log(`Output written to: ${outputPath}`);
}

// Run
buildPrefectureFeatures().catch(console.error);
