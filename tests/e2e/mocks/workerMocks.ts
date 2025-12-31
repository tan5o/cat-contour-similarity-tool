import type { Page } from '@playwright/test';

export interface WorkerMockOptions {
  failLoad?: boolean;
  delay?: number;
}

export const installWorkerMocks = async (page: Page, options?: WorkerMockOptions) => {
  await page.addInitScript(
    ({ failLoad, delay }) => {
      const mockContour = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ];

      const mockMatches = [
        {
          prefCode: '13',
          name: '東京都',
          nameEn: 'Tokyo',
          score: 0.123,
          weights: {
            efd: 0.2,
            turning: 0.2,
            hu: 0.2,
            roughness: 0.1,
            peak: 0.1,
            spread: 0.2,
            circularity: 0.05,
            convexity: 0.05,
            solidity: 0.05,
            radialFft: 0.1,
            smoothPenalty: 0.8,
            baseSmoothPenalty: 0.6
          },
          breakdown: {
            weighted: {
              efd: 0.012,
              turning: 0.024,
              hu: 0.036,
              roughness: 0.01,
              peak: 0.02,
              spread: 0.021,
              circularity: 0.004,
              convexity: 0.004,
              solidity: 0.004,
              radialFft: 0.006,
              smoothPenalty: 0.0,
              baseSmoothPenalty: 0.0
            },
            normalized: {
              efd: 0.06,
              turning: 0.12,
              hu: 0.18,
              roughness: 0.1,
              peak: 0.2,
              spread: 0.105,
              circularity: 0.08,
              convexity: 0.08,
              solidity: 0.08,
              radialFft: 0.06,
              smoothPenalty: 0.0,
              baseSmoothPenalty: 0.0
            },
            weights: {
              efd: 0.2,
              turning: 0.2,
              hu: 0.2,
              roughness: 0.1,
              peak: 0.1,
              spread: 0.2,
              circularity: 0.05,
              convexity: 0.05,
              solidity: 0.05,
              radialFft: 0.1,
              smoothPenalty: 0.8,
              baseSmoothPenalty: 0.6
            }
          },
          align: {
            rotationDeg: 0,
            scale: 1
          },
          outline: mockContour
        },
        {
          prefCode: '01',
          name: '北海道',
          nameEn: 'Hokkaido',
          score: 0.234,
          weights: {
            efd: 0.2,
            turning: 0.2,
            hu: 0.2,
            roughness: 0.1,
            peak: 0.1,
            spread: 0.2,
            circularity: 0.05,
            convexity: 0.05,
            solidity: 0.05,
            radialFft: 0.1,
            smoothPenalty: 0.8,
            baseSmoothPenalty: 0.6
          },
          breakdown: {
            weighted: {
              efd: 0.02,
              turning: 0.04,
              hu: 0.06,
              roughness: 0.02,
              peak: 0.03,
              spread: 0.064,
              circularity: 0.005,
              convexity: 0.005,
              solidity: 0.005,
              radialFft: 0.01,
              smoothPenalty: 0.0,
              baseSmoothPenalty: 0.0
            },
            normalized: {
              efd: 0.1,
              turning: 0.2,
              hu: 0.3,
              roughness: 0.2,
              peak: 0.3,
              spread: 0.32,
              circularity: 0.1,
              convexity: 0.1,
              solidity: 0.1,
              radialFft: 0.1,
              smoothPenalty: 0.0,
              baseSmoothPenalty: 0.0
            },
            weights: {
              efd: 0.2,
              turning: 0.2,
              hu: 0.2,
              roughness: 0.1,
              peak: 0.1,
              spread: 0.2,
              circularity: 0.05,
              convexity: 0.05,
              solidity: 0.05,
              radialFft: 0.1,
              smoothPenalty: 0.8,
              baseSmoothPenalty: 0.6
            }
          },
          align: {
            rotationDeg: 5,
            scale: 0.95
          },
          outline: mockContour
        },
        {
          prefCode: '27',
          name: '大阪府',
          nameEn: 'Osaka',
          score: 0.345,
          weights: {
            efd: 0.2,
            turning: 0.2,
            hu: 0.2,
            roughness: 0.1,
            peak: 0.1,
            spread: 0.2,
            circularity: 0.05,
            convexity: 0.05,
            solidity: 0.05,
            radialFft: 0.1,
            smoothPenalty: 0.8,
            baseSmoothPenalty: 0.6
          },
          breakdown: {
            weighted: {
              efd: 0.03,
              turning: 0.06,
              hu: 0.09,
              roughness: 0.02,
              peak: 0.04,
              spread: 0.078,
              circularity: 0.006,
              convexity: 0.006,
              solidity: 0.006,
              radialFft: 0.012,
              smoothPenalty: 0.0,
              baseSmoothPenalty: 0.0
            },
            normalized: {
              efd: 0.15,
              turning: 0.3,
              hu: 0.45,
              roughness: 0.2,
              peak: 0.4,
              spread: 0.39,
              circularity: 0.12,
              convexity: 0.12,
              solidity: 0.12,
              radialFft: 0.12,
              smoothPenalty: 0.0,
              baseSmoothPenalty: 0.0
            },
            weights: {
              efd: 0.2,
              turning: 0.2,
              hu: 0.2,
              roughness: 0.1,
              peak: 0.1,
              spread: 0.2,
              circularity: 0.05,
              convexity: 0.05,
              solidity: 0.05,
              radialFft: 0.1,
              smoothPenalty: 0.8,
              baseSmoothPenalty: 0.6
            }
          },
          align: {
            rotationDeg: -8,
            scale: 1.05
          },
          outline: mockContour
        }
      ];

      type MessageListener = (event: { data: unknown }) => void;

      class MockWorker {
        private url: string;
        private listeners: Set<MessageListener>;
        public onmessage: MessageListener | null;

        constructor(url: string | URL) {
          this.url = String(url);
          this.listeners = new Set();
          this.onmessage = null;
        }

        addEventListener(type: string, listener: MessageListener) {
          if (type === 'message') {
            this.listeners.add(listener);
          }
        }

        removeEventListener(type: string, listener: MessageListener) {
          if (type === 'message') {
            this.listeners.delete(listener);
          }
        }

        private dispatch(data: unknown) {
          const event = { data };
          if (typeof this.onmessage === 'function') {
            this.onmessage(event);
          }
          this.listeners.forEach(listener => listener(event));
        }

        postMessage(message: {
          type: string;
          requestId: string;
          imageData?: { width: number; height: number };
        }) {
          const { type, requestId } = message;
          const isSegmentWorker = this.url.includes('segmentWorker');
          const isContourWorker = this.url.includes('contourWorker');
          const responseDelay = delay ?? 50;

          if (isSegmentWorker) {
            if (type === 'load') {
              this.dispatch({ type: 'progress', progress: 0, requestId });
              if (failLoad) {
                setTimeout(
                  () => this.dispatch({ type: 'error', error: 'Network error', requestId }),
                  responseDelay
                );
              } else {
                setTimeout(() => this.dispatch({ type: 'loaded', requestId }), responseDelay);
              }
              return;
            }

            if (type === 'segment') {
              const { imageData } = message;
              const width = imageData?.width ?? 1;
              const height = imageData?.height ?? 1;
              const mask = new Uint8Array(width * height).fill(255);

              setTimeout(() => {
                this.dispatch({ type: 'progress', progress: 20, requestId });
                this.dispatch({ type: 'progress', progress: 40, requestId });
                this.dispatch({ type: 'progress', progress: 70, requestId });
                this.dispatch({ type: 'progress', progress: 85, requestId });
                this.dispatch({
                  type: 'segmented',
                  requestId,
                  data: {
                    mask,
                    width,
                    height,
                    confidence: 0.9
                  }
                });
              }, responseDelay);
              return;
            }
          }

          if (isContourWorker) {
            if (type === 'process') {
              setTimeout(() => {
                this.dispatch({ type: 'progress', progress: 10, requestId });
                this.dispatch({ type: 'progress', progress: 30, requestId });
                this.dispatch({ type: 'progress', progress: 50, requestId });
                this.dispatch({ type: 'progress', progress: 60, requestId });
                this.dispatch({ type: 'progress', progress: 80, requestId });
                this.dispatch({
                  type: 'contour',
                  requestId,
                  data: {
                    points: mockContour,
                    normalized: mockContour,
                    features: {
                      efd: [0.1, 0.2, 0.3],
                      turning: [0.1, 0.2, 0.3],
                      huMoments: [0.1, 0.2, 0.3],
                      circularity: 0.7,
                      convexity: 0.9,
                      solidity: 0.85,
                      radialFft: [0.05, 0.04, 0.03]
                    }
                  }
                });
              }, responseDelay);
              return;
            }

            if (type === 'match') {
              setTimeout(() => {
                this.dispatch({ type: 'progress', progress: 50, requestId });
                this.dispatch({
                  type: 'matched',
                  requestId,
                  data: {
                    matches: mockMatches
                  }
                });
              }, responseDelay);
            }
          }
        }

        terminate() {}
      }

      (window as unknown as { Worker: typeof MockWorker }).Worker = MockWorker;
    },
    { failLoad: options?.failLoad ?? false, delay: options?.delay ?? 50 }
  );
};
