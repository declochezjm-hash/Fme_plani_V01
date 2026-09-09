import { inject, Injectable } from '@angular/core';
import type { EtlPipelineJson } from '../../copilot/copilot.types';
import type { PipelineRunResult } from './etl.types';
import { PipelineRunnerExecutor } from './pipeline-runner.executor';

@Injectable({ providedIn: 'root' })
export class PipelineRunnerService {
  private readonly executor = inject(PipelineRunnerExecutor);

  run(pipeline: EtlPipelineJson, defaultSrid = 4326): Promise<PipelineRunResult> {
    return this.executor.run(pipeline, defaultSrid);
  }
}
