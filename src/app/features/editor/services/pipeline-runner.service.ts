import { Injectable } from '@angular/core';
import type { EtlPipelineJson, EtlPipelineNode } from '../../copilot/copilot.types';
import type { EtlDataset, PipelineRunResult, TransformerContext } from './etl.types';
import { readDataset } from './readers/reader.registry';
import { bufferDataset } from './transformers/buffer.transformer';
import { reprojectDataset } from './transformers/reproject.transformer';
import { topologyDataset } from './transformers/topology.transformer';

@Injectable({ providedIn: 'root' })
export class PipelineRunnerService {
  async run(pipeline: EtlPipelineJson, defaultSrid = 4326): Promise<PipelineRunResult> {
    const started = performance.now();
    const logs: string[] = [];
    const nodeResults: PipelineRunResult['metrics']['nodeResults'] = {};
    const outputs = new Map<string, EtlDataset>();

    const order = this.topologicalSort(pipeline);
    if (order.length === 0) {
      throw new Error('Pipeline vide ou invalide.');
    }

    let rowsRead = 0;
    let rowsWritten = 0;
    let finalOutput: EtlDataset | null = null;

    for (const nodeId of order) {
      const node = pipeline.nodes.find((item) => item.id === nodeId);
      if (!node) {
        continue;
      }

      logs.push(`Exécution du nœud « ${node.label} » (${node.type})`);

      if (node.type === 'reader') {
        const dataset = await readDataset({ node, defaultSrid });
        outputs.set(node.id, dataset);
        rowsRead += dataset.collection.features.length;
        nodeResults[node.id] = { featureCount: dataset.collection.features.length };
        logs.push(`  → ${dataset.collection.features.length} entité(s) lues`);
        continue;
      }

      const input = this.resolveInput(node, pipeline, outputs);
      if (!input) {
        throw new Error(`Nœud « ${node.label} » : entrée manquante.`);
      }

      const context: TransformerContext = { node, input, defaultSrid };
      let dataset: EtlDataset;

      switch (node.type) {
        case 'buffer':
          dataset = bufferDataset(context);
          break;
        case 'reproject':
          dataset = reprojectDataset(context);
          break;
        case 'topology_validator':
          dataset = topologyDataset(context);
          break;
        case 'clip':
          dataset = { ...input, meta: { ...input.meta, clipped: true } };
          break;
        case 'writer':
          dataset = input;
          finalOutput = dataset;
          rowsWritten = dataset.collection.features.length;
          nodeResults[node.id] = {
            featureCount: dataset.collection.features.length,
            message: 'Sortie GeoJSON produite',
          };
          logs.push(`  → ${dataset.collection.features.length} entité(s) en sortie`);
          outputs.set(node.id, dataset);
          continue;
        default:
          throw new Error(`Type de nœud non supporté : ${node.type}`);
      }

      outputs.set(node.id, dataset);
      nodeResults[node.id] = { featureCount: dataset.collection.features.length };
      logs.push(`  → ${dataset.collection.features.length} entité(s) transformées`);
    }

    const durationMs = Math.round(performance.now() - started);

    const intermediates: Record<string, EtlDataset> = {};
    for (const [nodeId, dataset] of outputs.entries()) {
      intermediates[nodeId] = dataset;
    }

    return {
      output: finalOutput,
      intermediates,
      metrics: {
        rowsRead,
        rowsWritten,
        durationMs,
        nodeResults,
      },
      logs,
    };
  }

  private resolveInput(
    node: EtlPipelineNode,
    pipeline: EtlPipelineJson,
    outputs: Map<string, EtlDataset>,
  ): EtlDataset | null {
    const incoming = pipeline.edges.filter((edge) => edge.target === node.id);
    if (incoming.length === 0) {
      return null;
    }

    return outputs.get(incoming[0].source) ?? null;
  }

  private topologicalSort(pipeline: EtlPipelineJson): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of pipeline.nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    for (const edge of pipeline.edges) {
      adjacency.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }

    const queue = pipeline.nodes
      .filter((node) => (inDegree.get(node.id) ?? 0) === 0)
      .map((node) => node.id);

    const sorted: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const next of adjacency.get(current) ?? []) {
        const degree = (inDegree.get(next) ?? 0) - 1;
        inDegree.set(next, degree);
        if (degree === 0) {
          queue.push(next);
        }
      }
    }

    if (sorted.length !== pipeline.nodes.length) {
      throw new Error('Cycle détecté dans le pipeline — vérifiez les connexions.');
    }

    return sorted;
  }
}
