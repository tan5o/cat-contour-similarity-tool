/**
 * Cat matchingで利用するWeb Workerを生成するファクトリ。
 * 呼び出し口を1か所にまとめ、パスの揺れを防ぐ。
 */
export function createCatMatchingWorkers() {
  const segmentWorker = new Worker(new URL('../workers/segmentWorker.ts', import.meta.url), {
    type: 'module'
  });
  const contourWorker = new Worker(new URL('../workers/contourWorker.ts', import.meta.url), {
    type: 'module'
  });

  return { segmentWorker, contourWorker };
}
