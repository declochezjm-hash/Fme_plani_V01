import { Injectable, computed, signal } from '@angular/core';

export type ExecutionLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'STATS';

export type ExecutionLogFilter = 'all' | 'info' | 'warn' | 'error';

export interface ExecutionLogEntry {
  timestamp: string;
  level: ExecutionLogLevel;
  message: string;
  nodeId?: string;
  nodeLabel?: string;
}

export interface ExecutionReport {
  runName: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  memoryMb: number;
  entries: ExecutionLogEntry[];
  metrics: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class ExecutionLoggerService {
  private readonly _entries = signal<ExecutionLogEntry[]>([]);
  private readonly _report = signal<ExecutionReport | null>(null);
  private readonly _running = signal(false);

  private runName = 'pipeline';
  private startedAtMs = 0;

  readonly entries = this._entries.asReadonly();
  readonly report = this._report.asReadonly();
  readonly running = this._running.asReadonly();

  readonly formattedConsole = computed(() =>
    this._entries()
      .map((entry) => this.formatEntry(entry))
      .join('\n'),
  );

  begin(runName = 'pipeline'): void {
    this.runName = runName;
    this.startedAtMs = Date.now();
    this._running.set(true);
    this._entries.set([]);
    this._report.set(null);
    this.log('INFO', `Démarrage de l'exécution « ${runName} »`);
  }

  info(message: string, context?: { nodeId?: string; nodeLabel?: string }): void {
    this.log('INFO', message, context);
  }

  warn(message: string, context?: { nodeId?: string; nodeLabel?: string }): void {
    this.log('WARN', message, context);
  }

  error(message: string, context?: { nodeId?: string; nodeLabel?: string }): void {
    this.log('ERROR', message, context);
  }

  stats(message: string, context?: { nodeId?: string; nodeLabel?: string }): void {
    this.log('STATS', message, context);
  }

  finish(metrics: Record<string, unknown> = {}): void {
    const finishedAtMs = Date.now();
    const durationMs = finishedAtMs - this.startedAtMs;
    const memoryMb = this.readMemoryMb();

    this.stats(`Durée totale : ${durationMs} ms — Mémoire : ${memoryMb.toFixed(1)} Mo`);

    const report: ExecutionReport = {
      runName: this.runName,
      startedAt: this.formatTimestamp(new Date(this.startedAtMs)),
      finishedAt: this.formatTimestamp(new Date(finishedAtMs)),
      durationMs,
      memoryMb,
      entries: this._entries(),
      metrics,
    };

    this._report.set(report);
    this._running.set(false);
    this.info('Exécution terminée.');
  }

  clear(): void {
    this._entries.set([]);
    this._report.set(null);
    this._running.set(false);
    this.startedAtMs = 0;
  }

  filterEntries(level: ExecutionLogFilter, query: string): ExecutionLogEntry[] {
    const normalizedQuery = query.trim().toLowerCase();
    return this._entries().filter((entry) => {
      if (level === 'info' && entry.level !== 'INFO') {
        return false;
      }
      if (level === 'warn' && entry.level !== 'WARN') {
        return false;
      }
      if (level === 'error' && entry.level !== 'ERROR') {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const haystack = `${entry.message} ${entry.nodeLabel ?? ''} ${entry.level}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }

  downloadLogFile(filename?: string): void {
    const stamp = this.stampForFilename();
    const content = this.formattedConsole();
    this.downloadBlob(content, filename ?? `pipeline_execution_${stamp}.log`, 'text/plain;charset=utf-8');
  }

  downloadJsonReport(filename?: string): void {
    const stamp = this.stampForFilename();
    const report = this._report();
    const payload = report ?? {
      runName: this.runName,
      startedAt: this.formatTimestamp(new Date(this.startedAtMs || Date.now())),
      finishedAt: this.formatTimestamp(new Date()),
      durationMs: 0,
      memoryMb: this.readMemoryMb(),
      entries: this._entries(),
      metrics: {},
    };
    this.downloadBlob(
      JSON.stringify(payload, null, 2),
      filename ?? `pipeline_execution_${stamp}.json`,
      'application/json',
    );
  }

  private log(
    level: ExecutionLogLevel,
    message: string,
    context?: { nodeId?: string; nodeLabel?: string },
  ): void {
    const entry: ExecutionLogEntry = {
      timestamp: this.formatTimestamp(new Date()),
      level,
      message,
      nodeId: context?.nodeId,
      nodeLabel: context?.nodeLabel,
    };
    this._entries.update((entries) => [...entries, entry]);
  }

  private formatEntry(entry: ExecutionLogEntry): string {
    const label = entry.nodeLabel ? `[${entry.nodeLabel}] ` : '';
    return `${entry.timestamp} | ${entry.level.padEnd(5)} | ${label}${entry.message}`;
  }

  private formatTimestamp(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private stampForFilename(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  }

  private readMemoryMb(): number {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    if (memory?.usedJSHeapSize) {
      return memory.usedJSHeapSize / (1024 * 1024);
    }
    return 0;
  }

  private downloadBlob(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
