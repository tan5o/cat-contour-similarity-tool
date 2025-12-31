import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { WorkerResponseBase } from '../workers/types';
import { createCatMatchingWorkers } from '../lib/createWorkers';

export type WorkerHandlerMap = MutableRefObject<Map<string, (data: WorkerResponseBase) => void>>;

export function useWorkerMessaging() {
  const segmentWorkerRef = useRef<Worker | null>(null);
  const contourWorkerRef = useRef<Worker | null>(null);
  const segmentHandlersRef = useRef<Map<string, (data: WorkerResponseBase) => void>>(new Map());
  const contourHandlersRef = useRef<Map<string, (data: WorkerResponseBase) => void>>(new Map());
  const requestIdRef = useRef(0);

  const nextRequestId = () => `req-${requestIdRef.current++}`;

  useEffect(() => {
    const { segmentWorker, contourWorker } = createCatMatchingWorkers();
    segmentWorkerRef.current = segmentWorker;
    contourWorkerRef.current = contourWorker;

    const handleSegmentMessage = (event: MessageEvent<WorkerResponseBase>) => {
      const { requestId } = event.data;
      if (!requestId) return;
      const handler = segmentHandlersRef.current.get(requestId);
      if (handler) {
        handler(event.data);
      }
    };

    const handleContourMessage = (event: MessageEvent<WorkerResponseBase>) => {
      const { requestId } = event.data;
      if (!requestId) return;
      const handler = contourHandlersRef.current.get(requestId);
      if (handler) {
        handler(event.data);
      }
    };

    segmentWorker.addEventListener('message', handleSegmentMessage);
    contourWorker.addEventListener('message', handleContourMessage);

    return () => {
      segmentWorker.removeEventListener('message', handleSegmentMessage);
      contourWorker.removeEventListener('message', handleContourMessage);
      segmentWorker.terminate();
      contourWorker.terminate();
    };
  }, []);

  const sendWorkerMessage = useCallback(
    (
      workerRef: MutableRefObject<Worker | null>,
      handlerMap: WorkerHandlerMap,
      payload: Record<string, unknown>,
      onProgress?: (progress: number) => void
    ) => {
      return new Promise<WorkerResponseBase>((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error('Worker is not initialized'));
          return;
        }

        const requestId = nextRequestId();
        const handleMessage = (data: WorkerResponseBase) => {
          if (data.type === 'progress') {
            if (typeof data.progress === 'number') {
              onProgress?.(data.progress);
            }
            return;
          }

          if (data.type === 'error') {
            handlerMap.current.delete(requestId);
            reject(new Error(data.error || 'Unknown error'));
            return;
          }

          handlerMap.current.delete(requestId);
          resolve(data);
        };

        handlerMap.current.set(requestId, handleMessage);
        worker.postMessage({ ...payload, requestId });
      });
    },
    []
  );

  return {
    segmentWorkerRef,
    contourWorkerRef,
    segmentHandlersRef,
    contourHandlersRef,
    sendWorkerMessage
  };
}
