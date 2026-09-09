/// <reference lib="webworker" />

import { executePipeline } from './pipeline-runner.engine';
import type { PipelineExecutionProgress } from './pipeline-execution.service';

addEventListener('message', (event: MessageEvent<{ pipeline: unknown; defaultSrid: number }>) => {
  void (async () => {
    try {
      const onProgress = (update: PipelineExecutionProgress) => {
        postMessage({ type: 'progress', ...update });
      };

      const result = await executePipeline(
        event.data.pipeline as import('../../copilot/copilot.types').EtlPipelineJson,
        event.data.defaultSrid,
        onProgress,
      );

      postMessage({ type: 'done', ok: true, result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur worker ETL';
      postMessage({ type: 'done', ok: false, error: message });
    }
  })();
});
