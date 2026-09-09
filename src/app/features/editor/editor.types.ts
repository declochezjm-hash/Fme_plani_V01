import type { EtlPipelineJson } from '../copilot/copilot.types';

export type ProjectStatus = 'draft' | 'active' | 'archived';

export interface EtlProject {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  default_srid: number;
  pipeline_config: EtlPipelineJson;
  status: ProjectStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EtlTransformer {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  transformer_type: string;
  config: Record<string, unknown>;
  srid: number | null;
  canvas_position: { x: number; y: number };
  created_at: string;
  updated_at: string;
}

export interface CreateProjectDto {
  name: string;
  description?: string;
  default_srid?: number;
  pipeline_config?: EtlPipelineJson;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string | null;
  default_srid?: number;
  pipeline_config?: EtlPipelineJson;
  status?: ProjectStatus;
}
