import { loadModel, runInference, preprocessImageU2Net, getModelIOInfo } from '../lib/inference';
import type * as ort from 'onnxruntime-web';
import { postprocessMask } from '../lib/postprocess';
import { debugLog, DEFAULT_MASK_THRESHOLD } from '../lib/constants';
import type { SegmentRequest, SegmentResponse } from './types';

let modelLoaded = false;

/**
 * セグメンテーションワーカーのメイン処理。
 * モデルのロードと推論実行を制御する。
 */
self.onmessage = async (e: MessageEvent<SegmentRequest>) => {
  const { type, requestId } = e.data;

  try {
    if (type === 'load') {
      const { modelPath } = e.data;
      if (!modelPath) {
        throw new Error('Model path is required');
      }

      postMessage({ type: 'progress', progress: 0, requestId } satisfies SegmentResponse);

      await loadModel({ modelPath, preferredBackend: 'wasm' });
      modelLoaded = true;

      postMessage({ type: 'loaded', requestId } satisfies SegmentResponse);
    } else if (type === 'segment') {
      const { imageData, threshold = DEFAULT_MASK_THRESHOLD } = e.data;

      if (!modelLoaded) {
        throw new Error('Model not loaded');
      }

      if (!imageData) {
        throw new Error('Image data is required');
      }

      postMessage({ type: 'progress', progress: 20, requestId } satisfies SegmentResponse);

      // Preprocess for U2-Net (320x320) without ImageNet normalization (U2-Netp can run on 0-1 inputs)
      const {
        data: inputData,
        dims,
        scale,
        offsetX,
        offsetY
      } = preprocessImageU2Net(imageData, undefined, { useImageNetNorm: false });

      postMessage({ type: 'progress', progress: 40, requestId } satisfies SegmentResponse);

      // Run inference
      const output = await runInference(inputData, dims);

      postMessage({ type: 'progress', progress: 70, requestId } satisfies SegmentResponse);

      // Process U2-Net output
      // Use U2-Netp's primary output (d1). Fallback to first output if name lookup fails.
      const { outputNames } = getModelIOInfo();
      const preferredOutputName =
        outputNames.find(name => name.toLowerCase().includes('d1')) ?? outputNames[0];
      const outputTensor = ((preferredOutputName ? output[preferredOutputName] : undefined) ||
        Object.values(output)[0]) as ort.Tensor | undefined;

      if (!outputTensor) {
        throw new Error('Model output not found');
      }
      const outputData = outputTensor.data as Float32Array;
      const outputDims = outputTensor.dims as number[];

      const isDev = import.meta.env.DEV;
      if (isDev) {
        debugLog('Model output dims:', outputDims);
        debugLog('Model output data length:', outputData.length);
      }

      // Check raw output value range (also used to decide whether to apply sigmoid)
      let minVal = Infinity;
      let maxVal = -Infinity;
      let rawSum = 0;
      for (let i = 0; i < outputData.length; i++) {
        const value = outputData[i];
        rawSum += value;
        if (value < minVal) minVal = value;
        if (value > maxVal) maxVal = value;
      }
      if (isDev) {
        debugLog(`Raw output value range: [${minVal.toFixed(4)}, ${maxVal.toFixed(4)}]`);
      }

      // If the model already outputs probabilities (0-1), skip sigmoid to avoid over-saturation.
      let probData: Float32Array;
      let appliedSigmoid = false;
      let probSum = 0;
      if (minVal >= 0 && maxVal <= 1) {
        probData = outputData;
        probSum = rawSum;
      } else {
        const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
        probData = new Float32Array(outputData.length);
        for (let i = 0; i < outputData.length; i++) {
          const value = sigmoid(outputData[i]);
          probSum += value;
          probData[i] = value;
        }
        appliedSigmoid = true;
      }

      // If the mean probability is extremely high, invert once as a fallback (some checkpoints flip FG/BG)
      const meanProb = probSum / probData.length;
      let inverted = false;
      if (meanProb > 0.8) {
        for (let i = 0; i < probData.length; i++) {
          probData[i] = 1 - probData[i];
        }
        probSum = probData.length - probSum;
        inverted = true;
      }
      if (isDev) {
        debugLog(
          `Prob processing: sigmoid=${appliedSigmoid}, mean=${meanProb.toFixed(4)}, inverted=${inverted}`
        );
      }

      // Extract mask dimensions (U2Netp outputs 320x320 by default)
      const fallbackSize = 320;
      const maskHeight = outputDims[2] || fallbackSize;
      const maskWidth = outputDims[3] || fallbackSize;

      // Create mask at original image size using bilinear interpolation
      const fullMask = new Uint8Array(imageData.width * imageData.height);

      // Map from mask resolution back to original image size
      const invScale = 1 / scale;

      for (let origY = 0; origY < imageData.height; origY++) {
        for (let origX = 0; origX < imageData.width; origX++) {
          // Map to mask coordinates
          const maskX = origX / invScale + offsetX;
          const maskY = origY / invScale + offsetY;

          // Bounds check
          if (maskX < 0 || maskX >= maskWidth - 1 || maskY < 0 || maskY >= maskHeight - 1) {
            continue;
          }

          // Bilinear interpolation
          const x0 = Math.floor(maskX);
          const y0 = Math.floor(maskY);
          const x1 = x0 + 1;
          const y1 = y0 + 1;
          const fx = maskX - x0;
          const fy = maskY - y0;

          const v00 = probData[y0 * maskWidth + x0];
          const v10 = probData[y0 * maskWidth + x1];
          const v01 = probData[y1 * maskWidth + x0];
          const v11 = probData[y1 * maskWidth + x1];

          const interpolated =
            v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;

          // Apply threshold
          if (interpolated > threshold) {
            fullMask[origY * imageData.width + origX] = 255;
          }
        }
      }

      postMessage({ type: 'progress', progress: 85, requestId } satisfies SegmentResponse);

      if (isDev) {
        let fullMaskNonZero = 0;
        for (let i = 0; i < fullMask.length; i++) {
          if (fullMask[i] > 0) fullMaskNonZero++;
        }
        debugLog(
          `Full mask (before postprocess): ${fullMaskNonZero}/${fullMask.length} non-zero pixels`
        );
      }

      // Post-process mask
      const processedMask = postprocessMask(fullMask, imageData.width, imageData.height);

      if (isDev) {
        let processedMaskNonZero = 0;
        for (let i = 0; i < processedMask.length; i++) {
          if (processedMask[i] > 0) processedMaskNonZero++;
        }
        debugLog(`Processed mask: ${processedMaskNonZero}/${processedMask.length} non-zero pixels`);
      }

      // Calculate confidence (average probability of positive pixels)
      let confidence = 0;
      let count = 0;
      for (let i = 0; i < probData.length; i++) {
        const value = probData[i];
        if (value > threshold) {
          confidence += value;
          count++;
        }
      }
      confidence = count > 0 ? confidence / count : 0;

      if (isDev) {
        debugLog(`Using threshold: ${threshold}`);
        debugLog(
          `Pixels above threshold (${threshold}): ${count}/${probData.length} (${((count / probData.length) * 100).toFixed(2)}%)`
        );
      }

      postMessage({
        type: 'segmented',
        requestId,
        data: {
          mask: processedMask,
          width: imageData.width,
          height: imageData.height,
          confidence
        }
      } satisfies SegmentResponse);
    }
  } catch (error) {
    postMessage({
      type: 'error',
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    } satisfies SegmentResponse);
  }
};
