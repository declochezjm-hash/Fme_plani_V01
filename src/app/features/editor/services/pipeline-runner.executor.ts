import { inject, Injectable } from '@angular/core';
import type { EtlPipelineJson } from '../../copilot/copilot.types';
import type { PipelineRunResult } from './etl.types';
import { executePipeline } from './pipeline-runner.engine';
import { PipelineExecutionService } from './pipeline-execution.service';

type WorkerDoneMessage = {
  type: 'done';
  ok: boolean;
  result?: PipelineRunResult;
  error?: string;
};

type WorkerProgressMessage = {
  type: 'progress';
  percent: number;
  message: string;
  nodeId?: string;
};

type WorkerMessage = WorkerDoneMessage | WorkerProgressMessage;

@Injectable({ providedIn: 'root' })
export class PipelineRunnerExecutor {
  private readonly execution = inject(PipelineExecutionService);
  private worker: Worker | null = null;
  private workerFailed = false;

  async run(pipeline: EtlPipelineJson, defaultSrid = 4326): Promise<PipelineRunResult> {
    this.execution.begin();

    if (!this.workerFailed && typeof Worker !== 'undefined') {
      try {
        return await this.runInWorker(pipeline, defaultSrid);
      } catch {
        this.workerFailed = true;
        this.disposeWorker();
      }
    }

    return this.runOnMainThread(pipeline, defaultSrid);
  }

  private runOnMainThread(
    pipeline: EtlPipelineJson,
    defaultSrid: number,
  ): Promise<PipelineRunResult> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        void executePipeline(pipeline, defaultSrid, (update) => this.execution.report(update))
          .then((result) => {
            this.execution.finish();
            resolve(result);
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Erreur ETL';
            this.execution.fail(message);
            reject(error);
          });
      }, 0);
    });
  }

  private runInWorker(
    pipeline: EtlPipelineJson,
    defaultSrid: number,
  ): Promise<PipelineRunResult> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.worker) {
          this.worker = new Worker(new URL('./pipeline.worker', import.meta.url), {
            type: 'module',
          });
        }
      } catch {
        reject(new Error('Worker ETL indisponible'));
        return;
      }

      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Timeout worker ETL'));
      }, 120_000);

      const onMessage = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === 'progress') {
          this.execution.report({
            percent: event.data.percent,
            message: event.data.message,
            nodeId: event.data.nodeId,
          });
          return;
        }

        cleanup();
        if (event.data.ok && event.data.result) {
          this.execution.finish();
          resolve(event.data.result);
          return;
        }
        const message = event.data.error ?? 'Erreur worker ETL';
        this.execution.fail(message);
        reject(new Error(message));
      };

      const onError = () => {
        cleanup();
        this.execution.fail('Échec du worker ETL');
        reject(new Error('Échec du worker ETL'));
      };

      const cleanup = () => {
        window.clearTimeout(timeout);
        this.worker?.removeEventListener('message', onMessage);
        this.worker?.removeEventListener('error', onError);
      };

      this.worker.addEventListener('message', onMessage);
      this.worker.addEventListener('error', onError);
      this.worker.postMessage({ pipeline, defaultSrid });
    });
  }

  private disposeWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
