import type { EtlPipelineEdge, EtlPipelineNode } from '@app/features/copilot/copilot.types';
import { getNodeCategory } from '@app/features/editor/services/editor-canvas.utils';

export const HIERARCHY_RANK_WIDTH = 320;
export const HIERARCHY_ROW_HEIGHT = 160;
export const HIERARCHY_ORIGIN_X = 80;
export const HIERARCHY_ORIGIN_Y = 80;

export const OVERLAP_DELTA_X = 150;
export const OVERLAP_DELTA_Y = 50;

export function hasOverlappingNodes(
  nodes: EtlPipelineNode[],
  deltaX = OVERLAP_DELTA_X,
  deltaY = OVERLAP_DELTA_Y,
): boolean {
  for (let left = 0; left < nodes.length; left++) {
    for (let right = left + 1; right < nodes.length; right++) {
      const dx = Math.abs(nodes[left].position.x - nodes[right].position.x);
      const dy = Math.abs(nodes[left].position.y - nodes[right].position.y);
      if (dx < deltaX && dy < deltaY) {
        return true;
      }
    }
  }
  return false;
}

export function applyHierarchicalLayout(
  nodes: EtlPipelineNode[],
  edges: EtlPipelineEdge[],
): void {
  const ranks = computeNodeRanks(nodes, edges);
  const nodesByRank = new Map<number, EtlPipelineNode[]>();

  for (const node of nodes) {
    const rank = ranks.get(node.id) ?? 0;
    const bucket = nodesByRank.get(rank) ?? [];
    bucket.push(node);
    nodesByRank.set(rank, bucket);
  }

  const sortedRanks = [...nodesByRank.keys()].sort((left, right) => left - right);
  for (const rank of sortedRanks) {
    const rankNodes = nodesByRank.get(rank) ?? [];
    rankNodes.forEach((node, index) => {
      node.position = {
        x: HIERARCHY_ORIGIN_X + rank * HIERARCHY_RANK_WIDTH,
        y: HIERARCHY_ORIGIN_Y + index * HIERARCHY_ROW_HEIGHT,
      };
    });
  }
}

export function applyHierarchicalLayoutIfOverlapping(
  nodes: EtlPipelineNode[],
  edges: EtlPipelineEdge[],
): boolean {
  if (!hasOverlappingNodes(nodes)) {
    return false;
  }
  applyHierarchicalLayout(nodes, edges);
  return true;
}

function computeNodeRanks(
  nodes: EtlPipelineNode[],
  edges: EtlPipelineEdge[],
): Map<string, number> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set());
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) {
      continue;
    }
    const targets = adjacency.get(edge.source)!;
    if (!targets.has(edge.target)) {
      targets.add(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  const ranks = new Map<string, number>();
  const queue: string[] = [];

  for (const node of nodes) {
    const category = getNodeCategory(node.type);
    if (category === 'reader' || (inDegree.get(node.id) ?? 0) === 0) {
      queue.push(node.id);
      ranks.set(node.id, category === 'reader' ? 0 : 1);
    }
  }

  if (queue.length === 0 && nodes.length > 0) {
    queue.push(nodes[0].id);
    ranks.set(nodes[0].id, 0);
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);

    const currentRank = ranks.get(nodeId) ?? 0;
    for (const targetId of adjacency.get(nodeId) ?? []) {
      const nextRank = currentRank + 1;
      ranks.set(targetId, Math.max(ranks.get(targetId) ?? 0, nextRank));
      queue.push(targetId);
    }
  }

  let maxRank = 0;
  for (const rank of ranks.values()) {
    maxRank = Math.max(maxRank, rank);
  }

  for (const node of nodes) {
    if (!ranks.has(node.id)) {
      const category = getNodeCategory(node.type);
      ranks.set(node.id, category === 'writer' ? maxRank + 1 : maxRank);
    }
  }

  const writerRank = maxRank + 1;
  for (const node of nodes) {
    if (getNodeCategory(node.type) === 'writer') {
      ranks.set(node.id, writerRank);
    }
  }

  return ranks;
}
