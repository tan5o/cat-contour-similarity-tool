import * as ort from 'onnxruntime-web';
import { debugLog } from './constants';

/**
 * ONNX Runtime Webローダー
 */

export interface ModelLoadOptions {
  modelPath: string;
  preferredBackend?: 'webgpu' | 'webgl' | 'wasm';
}

let session: ort.InferenceSession | null = null;
let cachedInputName: string | null = null;

const DEFAULT_TARGET_SIZE = 320; // U2Netp expects 320x320 inputs

/**
 * ONNXモデルをロードする。
 * @param options ロードオプション
 * @returns 推論セッション
 */
export async function loadModel(options: ModelLoadOptions): Promise<ort.InferenceSession> {
  const { modelPath, preferredBackend = 'webgpu' } = options;

  // Try backends in order: WebGPU -> WebGL -> WASM
  const backends: Array<'webgpu' | 'webgl' | 'wasm'> = [preferredBackend];

  if (preferredBackend !== 'webgl') backends.push('webgl');
  if (preferredBackend !== 'wasm') backends.push('wasm');

  let lastError: Error | null = null;

  for (const backend of backends) {
    try {
      debugLog(`Attempting to load model with ${backend} backend...`);

      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: [backend],
        graphOptimizationLevel: 'all'
      };

      session = await ort.InferenceSession.create(modelPath, sessionOptions);
      cachedInputName = session.inputNames?.[0] ?? 'input';

      debugLog(`Model loaded successfully with ${backend} backend`);
      return session;
    } catch (error) {
      debugLog(`Failed to load with ${backend}:`, error);
      lastError = error as Error;
    }
  }

  throw new Error(`Failed to load model with any backend. Last error: ${lastError?.message}`);
}

export function getModelIOInfo(): { inputName: string | null; outputNames: string[] } {
  return {
    inputName: cachedInputName,
    outputNames: [...(session?.outputNames ?? [])]
  };
}

/**
 * 推論を実行する。
 * @param imageData 画像データ
 * @param dims 次元情報
 * @param inputName 入力名
 * @returns 推論結果
 */
export async function runInference(
  imageData: Float32Array,
  dims: number[],
  inputName?: string
): Promise<ort.InferenceSession.OnnxValueMapType> {
  if (!session) {
    throw new Error('Model not loaded. Call loadModel first.');
  }

  const resolvedInputName = inputName || cachedInputName || 'input';
  const tensor = new ort.Tensor('float32', imageData, dims);
  const feeds = { [resolvedInputName]: tensor };

  return await session.run(feeds);
}

/**
 * U2-Netモデル用の画像前処理を行う。
 * @param imageData 元画像データ
 * @param targetSize ターゲットサイズ
 * @param options オプション
 * @returns 前処理済みデータとメタデータ
 */
export function preprocessImageU2Net(
  imageData: ImageData,
  targetSize: number = DEFAULT_TARGET_SIZE,
  options?: { useImageNetNorm?: boolean }
): { data: Float32Array; dims: number[]; scale: number; offsetX: number; offsetY: number } {
  const { width, height, data } = imageData;
  const useImageNetNorm = options?.useImageNetNorm ?? false;
  const mean = useImageNetNorm ? [0.485, 0.456, 0.406] : [0, 0, 0];
  const std = useImageNetNorm ? [0.229, 0.224, 0.225] : [1, 1, 1];

  // Calculate scale to fit image into targetSize x targetSize
  const scale = Math.min(targetSize / width, targetSize / height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  // Calculate centering offset
  const offsetX = Math.floor((targetSize - newWidth) / 2);
  const offsetY = Math.floor((targetSize - newHeight) / 2);

  // Create output tensor (CHW format)
  const outputData = new Float32Array(3 * targetSize * targetSize);

  // Resize and normalize
  const scaleX = width / newWidth;
  const scaleY = height / newHeight;

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY = Math.floor(y * scaleY);
      const srcIdx = (srcY * width + srcX) * 4;

      const dstX = x + offsetX;
      const dstY = y + offsetY;
      const dstIdx = dstY * targetSize + dstX;

      // Normalize to [0, 1], optional ImageNet standardization, and arrange in CHW format
      const r = data[srcIdx] / 255.0;
      const g = data[srcIdx + 1] / 255.0;
      const b = data[srcIdx + 2] / 255.0;

      outputData[dstIdx] = (r - mean[0]) / std[0]; // R
      outputData[targetSize * targetSize + dstIdx] = (g - mean[1]) / std[1]; // G
      outputData[2 * targetSize * targetSize + dstIdx] = (b - mean[2]) / std[2]; // B
    }
  }

  return {
    data: outputData,
    dims: [1, 3, targetSize, targetSize],
    scale,
    offsetX,
    offsetY
  };
}

/**
 * YOLOモデル用の画像前処理。
 * @param imageData 元画像データ
 * @param targetSize ターゲットサイズ
 * @returns 前処理済みデータ
 */
export function preprocessImage(
  imageData: ImageData,
  targetSize: number = 640
): { data: Float32Array; dims: number[] } {
  const { width, height, data } = imageData;

  // Calculate resize dimensions (maintain aspect ratio)
  const scale = targetSize / Math.max(width, height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  // Create padded image
  const paddedData = new Float32Array(3 * targetSize * targetSize);

  // Resize and normalize
  const scaleX = width / newWidth;
  const scaleY = height / newHeight;

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY = Math.floor(y * scaleY);
      const srcIdx = (srcY * width + srcX) * 4;

      const dstIdx = y * targetSize + x;

      // Normalize to [0, 1] and arrange in CHW format
      paddedData[dstIdx] = data[srcIdx] / 255.0; // R
      paddedData[targetSize * targetSize + dstIdx] = data[srcIdx + 1] / 255.0; // G
      paddedData[2 * targetSize * targetSize + dstIdx] = data[srcIdx + 2] / 255.0; // B
    }
  }

  return {
    data: paddedData,
    dims: [1, 3, targetSize, targetSize]
  };
}

/**
 * ロードされたモデルを破棄する。
 */
export function disposeModel(): void {
  if (session) {
    session.release();
    session = null;
  }
  cachedInputName = null;
}
