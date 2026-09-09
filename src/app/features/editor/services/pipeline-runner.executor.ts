import { inject, Injectable } from '@angular/core';
import type { EtlPipelineJson } from '../../copilot/copilot.types';
import type { PipelineRunResult } from './etl.types';
import { executePipeline } from './pipeline-runner.engine';
import { PipelineExecutionService, type PipelineExecutionProgress } from './pipeline-execution.service';
import type { PipelineRunOptions } from './pipeline-runner.service';

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

interface RunSession {
  aborted: boolean;
  reject: ((error: Error) => void) | null;
}

const ABORT_MESSAGE = 'Exécution annulée par l\'utilisateur.';

@Injectable({ providedIn: 'root' })
export class PipelineRunnerExecutor {
  private readonly execution = inject(PipelineExecutionService);
  private worker: Worker | null = null;
  private workerFailed = false;
  private activeSession: RunSession | null = null;

  async run(
    pipeline: EtlPipelineJson,
    defaultSrid = 4326,
    options?: PipelineRunOptions,
  ): Promise<PipelineRunResult> {
    const session: RunSession = { aborted: false, reject: null };
    this.activeSession = session;
    this.execution.begin();

    try {
      if (!this.workerFailed && typeof Worker !== 'undefined') {
        try {
          return await this.runInWorker(pipeline, defaultSrid, options, session);
        } catch (error: unknown) {
          if (session.aborted) {
            throw error;
          }
          this.workerFailed = true;
          this.disposeWorker();
        }
      }

      return await this.runOnMainThread(pipeline, defaultSrid, options, session);
    } finally {
      if (this.activeSession === session) {
        this.activeSession = null;
      }
    }
  }

  abort(): void {
    const session = this.activeSession;
    if (!session || session.aborted) {
      return;
    }

    session.aborted = true;
    this.disposeWorker();
    this.execution.fail(ABORT_MESSAGE);
    session.reject?.(new Error(ABORT_MESSAGE));
    this.activeSession = null;
  }

  private reportProgress(update: PipelineExecutionProgress, options?: PipelineRunOptions): void {
    this.execution.report(update);
    options?.onProgress?.(update);
  }

  private runOnMainThread(
    pipeline: EtlPipelineJson,
    defaultSrid: number,
    options: PipelineRunOptions | undefined,
    session: RunSession,
  ): Promise<PipelineRunResult> {
    return new Promise((resolve, reject) => {
      session.reject = reject;

      setTimeout(() => {
        void executePipeline(
          pipeline,
          defaultSrid,
          (update) => this.reportProgress(update, options),
          () => session.aborted,
        )
          .then((result) => {
            if (session.aborted) {
              reject(new Error(ABORT_MESSAGE));
              return;
            }
            this.execution.finish();
            resolve(result);
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Erreur ETL';
            if (!session.aborted) {
              this.execution.fail(message);
            }
            reject(error);
          });
      }, 0);
    });
  }

  private runInWorker(
    pipeline: EtlPipelineJson,
    defaultSrid: number,
    options: PipelineRunOptions | undefined,
    session: RunSession,
  ): Promise<PipelineRunResult> {
    return new Promise((resolve, reject) => {
      session.reject = reject;

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
          this.reportProgress(
            {
              percent: event.data.percent,
              message: event.data.message,
              nodeId: event.data.nodeId,
            },
            options,
          );
          return;
        }

        cleanup();
        if (session.aborted) {
          reject(new Error(ABORT_MESSAGE));
          return;
        }
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
        if (!session.aborted) {
          this.execution.fail('Échec du worker ETL');
          reject(new Error('Échec du worker ETL'));
        }
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
