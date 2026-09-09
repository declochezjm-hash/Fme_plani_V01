export type CopilotMode = 'novice' | 'expert';

export type CopilotMessageRole = 'user' | 'assistant' | 'system';

export interface CopilotMessage {
  id: string;
  role: CopilotMessageRole;
  content: string;
  timestamp: string;
  pipeline?: EtlPipelineJson;
  plainFrenchSummary?: string;
}

export interface EtlPipelineNode {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
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
