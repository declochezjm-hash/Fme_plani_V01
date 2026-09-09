export type CopilotMode = 'novice' | 'expert';

export type CopilotMessageRole = 'user' | 'assistant' | 'system';

export interface CopilotDiagnosis {
  summary: string;
  suggestion: string;
  actionLabel?: string;
  actionType?: 'fix_srid' | 'reconnect_nodes' | 'check_format';
}

export interface CopilotMessage {
  id: string;
  role: CopilotMessageRole;
  content: string;
  timestamp: string;
  pipeline?: EtlPipelineJson;
  plainFrenchSummary?: string;
  diagnosis?: CopilotDiagnosis;
}

export interface EtlPipelineGroup {
  id: string;
  label: string;
  color: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface EtlPipelineNode {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  groupId?: string;
}

export interface EtlPipelineEdge {
  id: string;
  source: string;
  target: string;
}

export interface EtlPipelineJson {
  version: number;
  nodes: EtlPipelineNode[];
  edges: EtlPipelineEdge[];
  groups?: EtlPipelineGroup[];
}

export interface CopilotPromptResult {
  reply: string;
  plainFrenchSummary?: string;
  pipeline?: EtlPipelineJson;
  llmUsed?: boolean;
}

export interface CopilotExplainContext {
  nodeLabel?: string;
  nodeType?: string;
  nodeConfig?: Record<string, unknown>;
  errorMessage?: string;
  pipelineSummary?: string;
}
