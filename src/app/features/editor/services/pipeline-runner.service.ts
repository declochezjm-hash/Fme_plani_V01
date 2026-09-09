import { inject, Injectable } from '@angular/core';
import type { EtlPipelineJson } from '../../copilot/copilot.types';
import type { PipelineRunResult } from './etl.types';
import type { PipelineExecutionProgress } from './pipeline-execution.service';
import { PipelineRunnerExecutor } from './pipeline-runner.executor';

export interface PipelineRunOptions {
  onProgress?: (update: PipelineExecutionProgress) => void;
}

@Injectable({ providedIn: 'root' })
export class PipelineRunnerService {
  private readonly executor = inject(PipelineRunnerExecutor);

  run(
    pipeline: EtlPipelineJson,
    defaultSrid = 4326,
    options?: PipelineRunOptions,
  ): Promise<PipelineRunResult> {
    return this.executor.run(pipeline, defaultSrid, options);
  }

  abort(): void {
    this.executor.abort();
  }
}
