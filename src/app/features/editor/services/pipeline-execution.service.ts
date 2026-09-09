import { Injectable, signal } from '@angular/core';

export interface PipelineExecutionProgress {
  percent: number;
  message: string;
  nodeId?: string;
}

@Injectable({ providedIn: 'root' })
export class PipelineExecutionService {
  private readonly _progress = signal(0);
  private readonly _status = signal('');
  private readonly _running = signal(false);

  readonly progress = this._progress.asReadonly();
  readonly status = this._status.asReadonly();
  readonly running = this._running.asReadonly();

  begin(): void {
    this._running.set(true);
    this._progress.set(0);
    this._status.set('Initialisation…');
  }

  report(update: PipelineExecutionProgress): void {
    this._progress.set(Math.min(100, Math.max(0, update.percent)));
    this._status.set(update.message);
  }

  finish(): void {
    this._progress.set(100);
    this._status.set('Terminé');
    this._running.set(false);
  }

  fail(message: string): void {
    this._status.set(message);
    this._running.set(false);
  }

  reset(): void {
    this._progress.set(0);
    this._status.set('');
    this._running.set(false);
  }
}
