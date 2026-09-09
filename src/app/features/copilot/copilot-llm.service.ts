import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { EtlPipelineJson } from './copilot.types';

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CursorBridgeResponse {
  content?: string;
  error?: string;
  model?: string;
  provider?: string;
}

@Injectable({ providedIn: 'root' })
export class CopilotLlmService {
  private readonly bridgeUrl = environment.copilotBridgeUrl ?? '/api/copilot';
  private readonly model = environment.cursorModel ?? 'composer-2.5';

  async complete(messages: LlmChatMessage[]): Promise<string | null> {
    try {
      const response = await fetch(`${this.bridgeUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          model: this.model,
        }),
      });

      const payload = (await response.json()) as CursorBridgeResponse;

      if (!response.ok) {
        console.error('[CopilotLlmService]', payload.error ?? response.statusText);
        return null;
      }

      return payload.content?.trim() ?? null;
    } catch (error) {
      console.error('[CopilotLlmService] Pont Cursor indisponible. Lancez `npm run copilot:bridge`.', error);
      return null;
    }
  }

  async generatePipeline(prompt: string): Promise<EtlPipelineJson | null> {
    const system = `Tu es un assistant ETL géospatial. Réponds UNIQUEMENT avec un bloc JSON valide entre balises json_pipeline.
Schéma: {"version":1,"nodes":[{"id":"...","type":"reader|buffer|reproject|topology_validator|clip|writer","label":"...","config":{},"position":{"x":0,"y":120}}],"edges":[{"id":"...","source":"...","target":"..."}]}
Types reader config.format: geojson|shapefile|geopackage|csv|ifc.`;

    const content = await this.complete([
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ]);

    if (!content) {
      return null;
    }

    return this.extractPipelineJson(content);
  }

  async explain(context: string): Promise<string | null> {
    const content = await this.complete([
      {
        role: 'system',
        content:
          'Tu expliques des pipelines ETL géospatiaux en français clair, sans virgule Oxford. Propose 1 à 3 réglages concrets.',
      },
      { role: 'user', content: context },
    ]);

    return content;
  }

  extractPipelineJson(text: string): EtlPipelineJson | null {
    const fenced = text.match(/```json_pipeline\s*([\s\S]*?)```/i);
    const raw = fenced?.[1] ?? text.match(/\{[\s\S]*"nodes"[\s\S]*\}/)?.[0];
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as EtlPipelineJson;
      if (!parsed.nodes || !parsed.edges) {
        return null;
      }
      return { version: parsed.version ?? 1, nodes: parsed.nodes, edges: parsed.edges };
    } catch {
      return null;
    }
  }
}
