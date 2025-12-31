/**
 * Worker間通信の型定義
 */

import type { ContourFeatures, MatchResult, Point, PrefectureFeature } from '../types';
import type { WeightConfig } from '../lib/constants';

// ===== セグメンテーションWorker =====

export type SegmentRequestType = 'load' | 'segment';

export interface SegmentLoadRequest {
  type: 'load';
  modelPath: string;
  requestId: string;
}

export interface SegmentProcessRequest {
  type: 'segment';
  imageData: ImageData;
  threshold?: number;
  requestId: string;
}

export type SegmentRequest = SegmentLoadRequest | SegmentProcessRequest;

export interface SegmentLoadedResponse {
  type: 'loaded';
  requestId: string;
}

export interface SegmentedResponse {
  type: 'segmented';
  requestId: string;
  data: {
    mask: Uint8Array;
    width: number;
    height: number;
    confidence?: number;
  };
}

export interface SegmentProgressResponse {
  type: 'progress';
  requestId: string;
  progress: number;
}

export interface SegmentErrorResponse {
  type: 'error';
  requestId: string;
  error: string;
}

export type SegmentResponse =
  | SegmentLoadedResponse
  | SegmentedResponse
  | SegmentProgressResponse
  | SegmentErrorResponse;

// ===== 輪郭処理Worker =====

export type ContourRequestType = 'process' | 'match';

export interface ContourProcessRequest {
  type: 'process';
  mask: Uint8Array;
  width: number;
  height: number;
  cnnModelPath?: string;
  requestId: string;
}

export interface ContourMatchRequest {
  type: 'match';
  features: ContourFeatures;
  prefectures: PrefectureFeature[];
  topN?: number;
  weights?: WeightConfig;
  cnnModelPath?: string;
  requestId: string;
}

export type ContourRequest = ContourProcessRequest | ContourMatchRequest;

export interface ContourProcessedResponse {
  type: 'contour';
  requestId: string;
  data: {
    points: Point[];
    normalized: Point[];
    features: ContourFeatures;
    cnnDebug?: { sdf: Float32Array; size: number };
  };
}

export interface ContourMatchedResponse {
  type: 'matched';
  requestId: string;
  data: {
    matches: MatchResult[];
  };
}

export interface ContourProgressResponse {
  type: 'progress';
  requestId: string;
  progress: number;
}

export interface ContourErrorResponse {
  type: 'error';
  requestId: string;
  error: string;
}

export type ContourResponse =
  | ContourProcessedResponse
  | ContourMatchedResponse
  | ContourProgressResponse
  | ContourErrorResponse;

// ===== 汎用レスポンス型（フック用） =====

export interface WorkerResponseBase {
  type: string;
  requestId: string;
  progress?: number;
  error?: string;
  data?: unknown;
}

export type AnyWorkerResponse = SegmentResponse | ContourResponse;
