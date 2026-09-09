/// <reference lib="webworker" />

import { executePipeline } from './pipeline-runner.engine';

addEventListener('message', (event: MessageEvent<{ pipeline: unknown; defaultSrid: number }>) => {
  void (async () => {
    try {
      const result = await executePipeline(
        event.data.pipeline as import('../../copilot/copilot.types').EtlPipelineJson,
        event.data.defaultSrid,
      );
      postMessage({ ok: true, result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur worker ETL';
      postMessage({ ok: false, error: message });
    }
  })();
});
