import type { EtlPipelineJson } from '@app/features/copilot/copilot.types';

export interface FmwImportResult {
  pipeline: EtlPipelineJson;
  warnings: string[];
  sourceName: string;
}

export interface FmwGuiObject {
  identifier: string;
  name: string;
  objectType: 'reader' | 'writer' | 'transformer';
  transformerKind?: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  hasExplicitPosition?: boolean;
}

export interface FmwLink {
  sourceId: string;
  targetId: string;
  sourcePort?: string;
  targetPort?: string;
}

export interface FmwBookmark {
  name: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  color?: string;
  memberIds?: string[];
}
