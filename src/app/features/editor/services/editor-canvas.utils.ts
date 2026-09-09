import type { EtlPipelineGroup, EtlPipelineNode } from '../../copilot/copilot.types';

export const NODE_WIDTH = 248;
export const NODE_HEADER_HEIGHT = 34;
export const GROUP_MIN_SIZE = 120;
export const GROUP_HEADER_OFFSET = 24;

export type NodeCategory = 'reader' | 'transformer' | 'writer';

export interface NodeTheme {
  headerBg: string;
  headerText: string;
  border: string;
  glow: string;
  icon: 'file' | 'cog' | 'export';
}

export interface NodeAttribute {
  name: string;
  type: string;
}

export interface PortDef {
  id: string;
  label: string;
  side: 'left' | 'right';
  offsetY: number;
}

export function getNodeCategory(type: string): NodeCategory {
  if (type === 'reader') {
    return 'reader';
  }
  if (type === 'writer') {
    return 'writer';
  }
  return 'transformer';
}

export function getNodeTheme(category: NodeCategory, dark: boolean): NodeTheme {
  if (category === 'reader') {
    return {
      headerBg: dark ? '#6b21a8' : '#2e7d32',
      headerText: '#ffffff',
      border: dark ? '#a855f7' : '#4ade80',
      glow: dark ? 'rgba(168,85,247,0.45)' : 'rgba(46,125,50,0.35)',
      icon: 'file',
    };
  }
  if (category === 'writer') {
    return {
      headerBg: dark ? '#b45309' : '#d97706',
      headerText: '#ffffff',
      border: dark ? '#fbbf24' : '#fb923c',
      glow: dark ? 'rgba(251,191,36,0.4)' : 'rgba(217,119,6,0.35)',
      icon: 'export',
    };
  }
  return {
    headerBg: dark ? '#0369a1' : '#0284c7',
    headerText: '#ffffff',
    border: dark ? '#38bdf8' : '#0ea5e9',
    glow: dark ? 'rgba(56,189,248,0.4)' : 'rgba(2,132,199,0.35)',
    icon: 'cog',
  };
}

export function getNodePorts(node: EtlPipelineNode): PortDef[] {
  if (node.type === 'writer') {
    return [
      { id: 'input', label: 'Input', side: 'left', offsetY: 52 },
      { id: 'output', label: 'Output', side: 'right', offsetY: 52 },
      { id: 'summary', label: 'Summary', side: 'right', offsetY: 76 },
    ];
  }

  if (node.type === 'tester' || node.type === 'topology_validator') {
    return [
      { id: 'input', label: 'Input', side: 'left', offsetY: 52 },
      { id: 'passed', label: 'Passed', side: 'right', offsetY: 52 },
      { id: 'failed', label: 'Failed', side: 'right', offsetY: 76 },
    ];
  }

  const category = getNodeCategory(node.type);
  const ports: PortDef[] = [];

  if (category !== 'reader') {
    ports.push({ id: 'input', label: 'Input', side: 'left', offsetY: 52 });
  }

  if (category !== 'writer') {
    ports.push({ id: 'output', label: 'Output', side: 'right', offsetY: 52 });
    ports.push({ id: 'rejected', label: 'Rejected', side: 'right', offsetY: 76 });
  }

  return ports;
}

export function getNodeAttributes(node: EtlPipelineNode): NodeAttribute[] {
  const userAttributes = node.config['userAttributes'];
  if (Array.isArray(userAttributes) && userAttributes.length > 0) {
    return userAttributes.map((attr: { name: string; type: string }) => ({
      name: attr.name,
      type: attr.type,
    }));
  }

  const attributes: NodeAttribute[] = [];

  if (node.type === 'reader') {
    const inline = node.config['inline'] as {
      features?: Array<{ properties?: Record<string, unknown> }>;
    };
    const keys = new Set<string>();
    inline?.features?.slice(0, 5).forEach((feature) => {
      Object.keys(feature.properties ?? {}).forEach((key) => keys.add(key));
    });
    keys.forEach((name) => attributes.push({ name, type: 'string' }));
    attributes.push({ name: 'geom', type: 'geometry' });
    return attributes.slice(0, 6);
  }

  if (node.type === 'buffer') {
    return [{ name: 'distance_m', type: 'number' }, { name: 'geom', type: 'geometry' }];
  }

  if (node.type === 'reproject') {
    return [
      { name: 'source_srid', type: 'number' },
      { name: 'target_srid', type: 'number' },
      { name: 'geom', type: 'geometry' },
    ];
  }

  if (node.type === 'topology_validator') {
    return [{ name: 'heal', type: 'boolean' }, { name: 'geom', type: 'geometry' }];
  }

  if (node.type === 'writer') {
    return [{ name: 'format', type: 'string' }, { name: 'geom', type: 'geometry' }];
  }

  Object.entries(node.config).slice(0, 4).forEach(([name, value]) => {
    attributes.push({ name, type: typeof value });
  });

  return attributes;
}

export function getNodeHeight(node: EtlPipelineNode): number {
  const portCount = Math.max(getNodePorts(node).length, getNodeAttributes(node).length);
  const attrCount = Math.max(2, portCount);
  return NODE_HEADER_HEIGHT + 24 + attrCount * 18 + 16;
}

export function getPortPosition(
  node: EtlPipelineNode,
  port: PortDef,
): { x: number; y: number } {
  const x = port.side === 'left' ? node.position.x : node.position.x + NODE_WIDTH;
  const y = node.position.y + port.offsetY;
  return { x, y };
}

export function defaultPortForConnection(
  node: EtlPipelineNode,
  side: 'source' | 'target',
): PortDef | null {
  const ports = getNodePorts(node);
  if (side === 'source') {
    return (
      ports.find((port) => port.id === 'output')
      ?? ports.find((port) => port.id === 'passed')
      ?? ports.find((port) => port.side === 'right')
      ?? null
    );
  }
  return ports.find((port) => port.id === 'input') ?? ports.find((port) => port.side === 'left') ?? null;
}

export interface EdgeGeometry {
  path: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  midpoint: { x: number; y: number };
}

function cubicBezierPoint(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

export function getEdgeGeometry(
  source: EtlPipelineNode,
  target: EtlPipelineNode,
): EdgeGeometry | null {
  const sourcePort = defaultPortForConnection(source, 'source');
  const targetPort = defaultPortForConnection(target, 'target');
  if (!sourcePort || !targetPort) {
    return null;
  }

  const start = getPortPosition(source, sourcePort);
  const end = getPortPosition(target, targetPort);
  const dx = Math.max(80, Math.abs(end.x - start.x) * 0.45);
  const cp1x = start.x + dx;
  const cp1y = start.y;
  const cp2x = end.x - dx;
  const cp2y = end.y;

  const midpoint = {
    x: cubicBezierPoint(0.5, start.x, cp1x, cp2x, end.x),
    y: cubicBezierPoint(0.5, start.y, cp1y, cp2y, end.y),
  };

  return {
    path: `M ${start.x} ${start.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${end.x} ${end.y}`,
    start,
    end,
    midpoint,
  };
}

export function isNodeInsideGroup(node: EtlPipelineNode, group: EtlPipelineGroup): boolean {
  const nodeWidth = NODE_WIDTH;
  const nodeHeight = getNodeHeight(node);
  const nodeX = node.position.x;
  const nodeY = node.position.y;
  const groupX = group.position.x;
  const groupY = group.position.y;
  const groupWidth = group.size.width;
  const groupHeight = group.size.height;

  return (
    nodeX >= groupX &&
    nodeX + nodeWidth <= groupX + groupWidth &&
    nodeY >= groupY &&
    nodeY + nodeHeight <= groupY + groupHeight
  );
}

export function getNodesInsideGroup(
  nodes: EtlPipelineNode[],
  group: EtlPipelineGroup,
): EtlPipelineNode[] {
  return nodes.filter((node) => isNodeInsideGroup(node, group));
}

export function findGroupForNode(
  node: EtlPipelineNode,
  groups: EtlPipelineGroup[],
): EtlPipelineGroup | null {
  return groups.find((group) => isNodeInsideGroup(node, group)) ?? null;
}

export const GROUP_COLOR_PALETTE = [
  '#0284c7',
  '#6b21a8',
  '#d97706',
  '#059669',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
];

export function findGroupAtPoint(
  x: number,
  y: number,
  groups: EtlPipelineGroup[],
): EtlPipelineGroup | null {
  return (
    groups.find(
      (group) =>
        x >= group.position.x &&
        x <= group.position.x + group.size.width &&
        y >= group.position.y &&
        y <= group.position.y + group.size.height,
    ) ?? null
  );
}

function findPortAtPoint(
  nodes: EtlPipelineNode[],
  x: number,
  y: number,
  side: 'left' | 'right',
  tolerance = 16,
): { nodeId: string; port: PortDef } | null {
  for (const node of nodes) {
    for (const port of getNodePorts(node).filter((item) => item.side === side)) {
      const position = getPortPosition(node, port);
      const distance = Math.hypot(position.x - x, position.y - y);
      if (distance <= tolerance) {
        return { nodeId: node.id, port };
      }
    }
  }
  return null;
}

export function findInputPortAtPoint(
  nodes: EtlPipelineNode[],
  x: number,
  y: number,
  tolerance = 16,
): { nodeId: string; port: PortDef } | null {
  return findPortAtPoint(nodes, x, y, 'left', tolerance);
}

export function findOutputPortAtPoint(
  nodes: EtlPipelineNode[],
  x: number,
  y: number,
  tolerance = 16,
): { nodeId: string; port: PortDef } | null {
  return findPortAtPoint(nodes, x, y, 'right', tolerance);
}
