import type { EtlPipelineGroup, EtlPipelineNode } from '../../copilot/copilot.types';

export const NODE_WIDTH = 280;
export const NODE_HEADER_HEIGHT = 40;
export const NODE_BODY_PADDING_TOP = 8;
export const NODE_PORT_COLUMN_PADDING_TOP = 4;
export const NODE_PORT_ROW_HEIGHT = 20;
export const NODE_PORT_DOT_CENTER_IN_ROW = 10;
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

function withComputedPortOffsets(ports: Omit<PortDef, 'offsetY'>[]): PortDef[] {
  const leftPorts = ports.filter((port) => port.side === 'left');
  const rightPorts = ports.filter((port) => port.side === 'right');

  const offsetFor = (_side: 'left' | 'right', index: number): number =>
    NODE_HEADER_HEIGHT
    + NODE_BODY_PADDING_TOP
    + NODE_PORT_COLUMN_PADDING_TOP
    + index * NODE_PORT_ROW_HEIGHT
    + NODE_PORT_DOT_CENTER_IN_ROW;

  return ports.map((port) => {
    const index = (port.side === 'left' ? leftPorts : rightPorts).findIndex((item) => item.id === port.id);
    return {
      ...port,
      offsetY: offsetFor(port.side, Math.max(0, index)),
    };
  });
}

export function getNodePorts(node: EtlPipelineNode): PortDef[] {
  if (node.type === 'writer') {
    return withComputedPortOffsets([
      { id: 'input', label: 'Input', side: 'left' },
      { id: 'output', label: 'Output', side: 'right' },
      { id: 'summary', label: 'Summary', side: 'right' },
    ]);
  }

  if (node.type === 'tester' || node.type === 'topology_validator') {
    return withComputedPortOffsets([
      { id: 'input', label: 'Input', side: 'left' },
      { id: 'passed', label: 'Passed', side: 'right' },
      { id: 'failed', label: 'Failed', side: 'right' },
    ]);
  }

  const category = getNodeCategory(node.type);
  const ports: Omit<PortDef, 'offsetY'>[] = [];

  if (category !== 'reader') {
    ports.push({ id: 'input', label: 'Input', side: 'left' });
  }

  if (category !== 'writer') {
    ports.push({ id: 'output', label: 'Output', side: 'right' });
    ports.push({ id: 'rejected', label: 'Rejected', side: 'right' });
  }

  return withComputedPortOffsets(ports);
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

export function getPortCenterYOffset(portIndexOnSide: number): number {
  return (
    NODE_HEADER_HEIGHT
    + NODE_BODY_PADDING_TOP
    + NODE_PORT_COLUMN_PADDING_TOP
    + portIndexOnSide * NODE_PORT_ROW_HEIGHT
    + NODE_PORT_DOT_CENTER_IN_ROW
  );
}

export function getPortPosition(
  node: EtlPipelineNode,
  port: PortDef,
): { x: number; y: number } {
  const sidePorts = getNodePorts(node).filter((item) => item.side === port.side);
  const index = Math.max(0, sidePorts.findIndex((item) => item.id === port.id));
  const x = port.side === 'left' ? node.position.x : node.position.x + NODE_WIDTH;
  const y = node.position.y + getPortCenterYOffset(index);
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

export function resolvePortById(node: EtlPipelineNode, portId?: string): PortDef | null {
  const ports = getNodePorts(node);
  if (!portId) {
    return null;
  }

  const direct = ports.find((port) => port.id === portId);
  if (direct) {
    return direct;
  }

  const lowered = portId.toLowerCase();
  return (
    ports.find((port) => port.id.toLowerCase() === lowered)
    ?? ports.find((port) => port.label.toLowerCase() === lowered)
    ?? ports.find((port) => port.label.toLowerCase().includes(lowered))
    ?? ports.find((port) => lowered.includes(port.id.toLowerCase()))
    ?? null
  );
}

function firstPortOnSide(node: EtlPipelineNode, side: 'left' | 'right'): PortDef | null {
  const ports = getNodePorts(node);
  return ports.find((port) => port.side === side) ?? ports[0] ?? null;
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

export function resolveEdgePorts(
  source: EtlPipelineNode,
  target: EtlPipelineNode,
  sourcePortId?: string,
  targetPortId?: string,
): { sourcePort: PortDef; targetPort: PortDef } {
  const sourcePort =
    resolvePortById(source, sourcePortId)
    ?? defaultPortForConnection(source, 'source')
    ?? firstPortOnSide(source, 'right');
  const targetPort =
    resolvePortById(target, targetPortId)
    ?? defaultPortForConnection(target, 'target')
    ?? firstPortOnSide(target, 'left');

  return { sourcePort: sourcePort!, targetPort: targetPort! };
}

export function getEdgeGeometry(
  source: EtlPipelineNode,
  target: EtlPipelineNode,
  options?: { sourcePortId?: string; targetPortId?: string },
): EdgeGeometry | null {
  const { sourcePort, targetPort } = resolveEdgePorts(
    source,
    target,
    options?.sourcePortId,
    options?.targetPortId,
  );

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

export function computePipelineBounds(
  nodes: EtlPipelineNode[],
  groups: EtlPipelineGroup[] = [],
  padding = 1200,
): { width: number; height: number; minX: number; minY: number } {
  let minX = 0;
  let minY = 0;
  let maxX = 3200;
  let maxY = 2400;

  for (const group of groups) {
    minX = Math.min(minX, group.position.x);
    minY = Math.min(minY, group.position.y);
    maxX = Math.max(maxX, group.position.x + group.size.width);
    maxY = Math.max(maxY, group.position.y + group.size.height);
  }

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + NODE_WIDTH);
    maxY = Math.max(maxY, node.position.y + getNodeHeight(node));
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    width: Math.max(8000, maxX - minX + padding * 2),
    height: Math.max(8000, maxY - minY + padding * 2),
  };
}

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
