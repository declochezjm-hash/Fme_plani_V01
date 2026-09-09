import { inject, Injectable } from '@angular/core';
import type { EtlPipelineJson } from '@app/features/copilot/copilot.types';
import { FmwImporterService } from './fmw-importer.service';
import type { FmwImportResult } from './fmw-importer.types';

export interface ProjectImportResult {
  pipeline: EtlPipelineJson;
  warnings: string[];
  sourceName: string;
  format: 'fmw' | 'json' | 'model3';
}

@Injectable({ providedIn: 'root' })
export class ProjectImportService {
  private readonly fmwImporter = inject(FmwImporterService);

  async importFile(file: File): Promise<ProjectImportResult> {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const text = await file.text();

    switch (extension) {
      case 'fmw':
        return this.fromFmw(text, file.name);
      case 'json':
        return this.fromJson(text, file.name);
      case 'model3':
        return this.fromModel3(text, file.name);
      default:
        throw new Error(`Extension .${extension} non supportée. Utilisez .fmw, .json ou .model3.`);
    }
  }

  isSupportedProjectFile(file: File): boolean {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    return extension === 'fmw' || extension === 'json' || extension === 'model3';
  }

  private fromFmw(content: string, sourceName: string): ProjectImportResult {
    const result: FmwImportResult = this.fmwImporter.parse(content, sourceName);
    return {
      pipeline: result.pipeline,
      warnings: result.warnings,
      sourceName: result.sourceName,
      format: 'fmw',
    };
  }

  private fromJson(content: string, sourceName: string): ProjectImportResult {
    const pipeline = JSON.parse(content) as EtlPipelineJson;
    this.assertPipeline(pipeline);
    return { pipeline, warnings: [], sourceName, format: 'json' };
  }

  private fromModel3(content: string, sourceName: string): ProjectImportResult {
    const parsed = JSON.parse(content) as { pipeline?: EtlPipelineJson } | EtlPipelineJson;
    const pipeline = 'pipeline' in parsed && parsed.pipeline ? parsed.pipeline : (parsed as EtlPipelineJson);
    this.assertPipeline(pipeline);
    return {
      pipeline,
      warnings: [],
      sourceName,
      format: 'model3',
    };
  }

  private assertPipeline(pipeline: EtlPipelineJson): void {
    if (!pipeline || !Array.isArray(pipeline.nodes) || !Array.isArray(pipeline.edges)) {
      throw new Error('Fichier projet invalide : structure pipeline attendue.');
    }
  }
}
