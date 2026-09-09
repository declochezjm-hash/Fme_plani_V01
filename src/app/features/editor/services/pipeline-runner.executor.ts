import { Injectable } from '@angular/core';
import type { EtlPipelineJson } from '../../copilot/copilot.types';
import type { PipelineRunResult } from './etl.types';
import { executePipeline } from './pipeline-runner.engine';

@Injectable({ providedIn: 'root' })
export class PipelineRunnerExecutor {
  private worker: Worker | null = null;
  private workerFailed = false;

  async run(pipeline: EtlPipelineJson, defaultSrid = 4326): Promise<PipelineRunResult> {
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
        void executePipeline(pipeline, defaultSrid).then(resolve).catch(reject);
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
          this.worker = new Worker(new URL('./pipeline-runner.worker', import.meta.url), {
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
      }, 30_000);

      const onMessage = (event: MessageEvent<{ ok: boolean; result?: PipelineRunResult; error?: string }>) => {
        cleanup();
        if (event.data.ok && event.data.result) {
          resolve(event.data.result);
          return;
        }
        reject(new Error(event.data.error ?? 'Erreur worker ETL'));
      };

      const onError = () => {
        cleanup();
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
