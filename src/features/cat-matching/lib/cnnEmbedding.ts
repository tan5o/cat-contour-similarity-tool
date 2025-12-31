import * as ort from 'onnxruntime-web';
import type { Point } from '../types';

const DEFAULT_INPUT_SIZE = 64;
const DEFAULT_PAD_RATIO = 0.12;
const DEFAULT_SDF_TAU = DEFAULT_INPUT_SIZE / 10;

export type CnnModelHandle = {
  session: ort.InferenceSession;
  inputName: string;
  outputName: string;
};

type ModelBackend = 'webgpu' | 'webgl' | 'wasm';

function normalizeEmbedding(vec: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    out[i] = vec[i] / norm;
  }
  return out;
}

export async function loadCnnModel(
  modelPath: string,
  preferredBackend: ModelBackend = 'webgpu'
): Promise<CnnModelHandle> {
  const backends: ModelBackend[] = [preferredBackend];
  if (preferredBackend !== 'webgl') backends.push('webgl');
  if (preferredBackend !== 'wasm') backends.push('wasm');

  const modelUrl = new URL(modelPath, self.location?.href ?? undefined);
  const dataFileName =
    modelUrl.pathname
      .split('/')
      .pop()
      ?.replace(/\.onnx$/i, '.onnx.data') ?? 'shape_cnn_64x64.onnx.data';
  const dataUrl = new URL(dataFileName, modelUrl).toString();

  let lastError: Error | null = null;
  for (const backend of backends) {
    try {
      const session = await ort.InferenceSession.create(modelPath, {
        executionProviders: [backend],
        graphOptimizationLevel: 'all',
        externalData: [
          {
            data: dataUrl,
            path: dataFileName
          }
        ]
      });
      const inputName = session.inputNames?.[0] ?? 'input';
      const outputName = session.outputNames?.[0] ?? 'output';
      return { session, inputName, outputName };
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw new Error(`Failed to load CNN model. Last error: ${lastError?.message}`);
}

export async function runCnnEmbedding(
  handle: CnnModelHandle,
  input: Float32Array,
  dims: number[]
): Promise<Float32Array> {
  const tensor = new ort.Tensor('float32', input, dims);
  const outputs = await handle.session.run({ [handle.inputName]: tensor });
  const output = outputs[handle.outputName];
  if (!output || !(output.data instanceof Float32Array)) {
    throw new Error('CNN output is missing or invalid');
  }
  return normalizeEmbedding(output.data);
}

function computeBoundsFromMask(
  mask: Uint8Array,
  width: number,
  height: number
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function expandToSquare(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  padRatio: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const width = Math.max(1e-6, maxX - minX);
  const height = Math.max(1e-6, maxY - minY);
  const padX = width * padRatio;
  const padY = height * padRatio;
  const paddedMinX = minX - padX;
  const paddedMaxX = maxX + padX;
  const paddedMinY = minY - padY;
  const paddedMaxY = maxY + padY;
  const side = Math.max(paddedMaxX - paddedMinX, paddedMaxY - paddedMinY);
  const cx = (paddedMinX + paddedMaxX) / 2;
  const cy = (paddedMinY + paddedMaxY) / 2;
  const half = side / 2;
  return {
    minX: cx - half,
    maxX: cx + half,
    minY: cy - half,
    maxY: cy + half
  };
}

function sampleMask(mask: Uint8Array, width: number, height: number, x: number, y: number): number {
  const xi = Math.max(0, Math.min(width - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(height - 1, Math.round(y)));
  return mask[yi * width + xi] > 0 ? 1 : 0;
}

export function resizeMaskToSquare(
  mask: Uint8Array,
  width: number,
  height: number,
  size: number = DEFAULT_INPUT_SIZE,
  padRatio: number = DEFAULT_PAD_RATIO
): Uint8Array | null {
  const bounds = computeBoundsFromMask(mask, width, height);
  if (!bounds) return null;

  const square = expandToSquare(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, padRatio);
  const out = new Uint8Array(size * size);
  const scaleX = (square.maxX - square.minX) / (size - 1);
  const scaleY = (square.maxY - square.minY) / (size - 1);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcX = square.minX + x * scaleX;
      const srcY = square.minY + y * scaleY;
      out[y * size + x] = sampleMask(mask, width, height, srcX, srcY);
    }
  }
  return out;
}

function computeBoundsFromPoints(
  points: Point[]
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;

  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    count++;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  if (count === 0) return null;
  return { minX, minY, maxX, maxY };
}

type PixelPoint = { x: number; y: number };

function fillPolygon(mask: Uint8Array, size: number, vertices: PixelPoint[]): void {
  if (vertices.length < 3) return;
  const count = vertices.length;
  for (let y = 0; y < size; y++) {
    const scanY = y;
    const intersections: number[] = [];
    for (let i = 0; i < count; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % count];
      if ((a.y <= scanY && b.y > scanY) || (b.y <= scanY && a.y > scanY)) {
        const t = (scanY - a.y) / (b.y - a.y);
        intersections.push(a.x + t * (b.x - a.x));
      }
    }
    if (intersections.length < 2) continue;
    intersections.sort((a, b) => a - b);
    for (let i = 0; i < intersections.length - 1; i += 2) {
      const xStart = Math.ceil(intersections[i]);
      const xEnd = Math.floor(intersections[i + 1]);
      if (xEnd < xStart) continue;
      const rowOffset = y * size;
      for (let x = xStart; x <= xEnd; x++) {
        if (x >= 0 && x < size) {
          mask[rowOffset + x] = 1;
        }
      }
    }
  }
}

export function outlineToMask(
  outline: Point[],
  size: number = DEFAULT_INPUT_SIZE,
  padRatio: number = DEFAULT_PAD_RATIO
): Uint8Array | null {
  if (outline.length < 3) return null;
  const bounds = computeBoundsFromPoints(outline);
  if (!bounds) return null;

  const square = expandToSquare(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, padRatio);
  const vertices: PixelPoint[] = outline.map(p => {
    // Undo 180° rotation without horizontal flip.
    const px = ((p.x - square.minX) / (square.maxX - square.minX)) * (size - 1);
    const py = ((p.y - square.minY) / (square.maxY - square.minY)) * (size - 1);
    const clippedX = Math.min(size - 1, Math.max(0, px));
    const clippedY = Math.min(size - 1, Math.max(0, py));
    return { x: Math.floor(clippedX), y: Math.floor(clippedY) };
  });

  const out = new Uint8Array(size * size);
  fillPolygon(out, size, vertices);
  return out;
}

function distanceTransform1D(f: Float32Array, n: number): Float32Array {
  const v = new Int32Array(n);
  const z = new Float32Array(n + 1);
  const d = new Float32Array(n);
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;

  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
    while (s <= z[k]) {
      if (k === 0) {
        break;
      }
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const val = q - v[k];
    d[q] = val * val + f[v[k]];
  }
  return d;
}

function euclideanDistanceTransform(
  mask: Uint8Array,
  width: number,
  height: number,
  target: 0 | 1
): Float32Array {
  const inf = 1e6;
  const tmp = new Float32Array(width * height);
  const f = new Float32Array(Math.max(width, height));

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const isTarget = (mask[y * width + x] > 0 ? 1 : 0) === target;
      f[y] = isTarget ? 0 : inf;
    }
    const dCol = distanceTransform1D(f, height);
    for (let y = 0; y < height; y++) {
      tmp[y * width + x] = dCol[y];
    }
  }

  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      f[x] = tmp[y * width + x];
    }
    const dRow = distanceTransform1D(f, width);
    for (let x = 0; x < width; x++) {
      out[y * width + x] = Math.sqrt(dRow[x]);
    }
  }
  return out;
}

export function maskToSdf(
  mask: Uint8Array,
  size: number = DEFAULT_INPUT_SIZE,
  tau: number = DEFAULT_SDF_TAU
): Float32Array {
  // scipy.ndimage.distance_transform_edt(fg) computes the distance from each pixel
  // to the nearest False pixel. So for fg (mask=True), pixels inside the foreground
  // get their distance to the nearest background pixel (positive inside foreground).
  //
  // Our euclideanDistanceTransform(mask, target) computes distance to the nearest
  // pixel matching 'target'. So:
  //   - bgDist (target=0): distance to nearest background → 0 in background, positive in foreground
  //   - fgDist (target=1): distance to nearest foreground → 0 in foreground, positive in background
  //
  // Python: sdf = edt_fg - edt_bg → positive inside foreground, negative in background
  // To match Python: sdf = bgDist - fgDist
  const fgDist = euclideanDistanceTransform(mask, size, size, 1);
  const bgDist = euclideanDistanceTransform(mask, size, size, 0);
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) {
    const sdf = bgDist[i] - fgDist[i];
    out[i] = Math.tanh(sdf / tau);
  }
  return out;
}

export function buildCnnInputFromMask(
  mask: Uint8Array,
  width: number,
  height: number,
  size: number = DEFAULT_INPUT_SIZE
): { data: Float32Array; dims: number[] } | null {
  const resized = resizeMaskToSquare(mask, width, height, size);
  if (!resized) return null;
  const sdf = maskToSdf(resized, size);
  return { data: sdf, dims: [1, 1, size, size] };
}

export function buildCnnInputFromOutline(
  outline: Point[],
  size: number = DEFAULT_INPUT_SIZE
): { data: Float32Array; dims: number[] } | null {
  const mask = outlineToMask(outline, size);
  if (!mask) return null;
  const sdf = maskToSdf(mask, size);
  return { data: sdf, dims: [1, 1, size, size] };
}

export function buildCnnInputFromOutlineWithMask(
  outline: Point[],
  size: number = DEFAULT_INPUT_SIZE
): { data: Float32Array; dims: number[]; mask: Uint8Array; size: number } | null {
  const mask = outlineToMask(outline, size);
  if (!mask) return null;
  const sdf = maskToSdf(mask, size);
  return { data: sdf, dims: [1, 1, size, size], mask, size };
}
