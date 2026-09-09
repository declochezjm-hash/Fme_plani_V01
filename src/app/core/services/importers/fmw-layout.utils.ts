import { NODE_WIDTH } from '@app/features/editor/services/editor-canvas.utils';

export const FME_NODE_ESTIMATED_HEIGHT = 120;
export const FME_LAYOUT_PADDING = 80;
export const FME_LAYOUT_TARGET = 3200;

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutRect {
  position: LayoutPoint;
  size: { width: number; height: number };
}

/** Inverse l'axe Y FME (Y négatif vers le bas) vers le canvas (Y positif vers le bas). */
export function flipFmeY(point: LayoutPoint): LayoutPoint {
  return { x: point.x, y: -point.y };
}

export function flipFmeRect(rect: LayoutRect): LayoutRect {
  const x1 = rect.position.x;
  const y1 = rect.position.y;
  const x2 = x1 + rect.size.width;
  const y2 = y1 + rect.size.height;

  const topLeft = flipFmeY({ x: x1, y: y2 });
  const bottomRight = flipFmeY({ x: x2, y: y1 });

  return {
    position: {
      x: Math.min(topLeft.x, bottomRight.x),
      y: Math.min(topLeft.y, bottomRight.y),
    },
    size: {
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y),
    },
  };
}

export function normalizeFmeLayout(
  nodePositions: LayoutPoint[],
  groupRects: LayoutRect[],
): { scale: number; offset: LayoutPoint } {
  const points: LayoutPoint[] = [...nodePositions];
  for (const rect of groupRects) {
    points.push(rect.position);
    points.push({
      x: rect.position.x + rect.size.width,
      y: rect.position.y + rect.size.height,
    });
  }

  if (points.length === 0) {
    return { scale: 1, offset: { x: FME_LAYOUT_PADDING, y: FME_LAYOUT_PADDING } };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const scale = Math.min(FME_LAYOUT_TARGET / width, FME_LAYOUT_TARGET / height, 1.5);

  return {
    scale,
    offset: {
      x: FME_LAYOUT_PADDING - minX * scale,
      y: FME_LAYOUT_PADDING - minY * scale,
    },
  };
}

export function applyLayoutTransform(point: LayoutPoint, scale: number, offset: LayoutPoint): LayoutPoint {
  return {
    x: point.x * scale + offset.x,
    y: point.y * scale + offset.y,
  };
}

export function applyLayoutTransformRect(
  rect: LayoutRect,
  scale: number,
  offset: LayoutPoint,
): LayoutRect {
  const topLeft = applyLayoutTransform(rect.position, scale, offset);
  return {
    position: topLeft,
    size: {
      width: rect.size.width * scale,
      height: rect.size.height * scale,
    },
  };
}

export function fitRectAroundPoints(
  points: LayoutPoint[],
  padding = 48,
  minWidth = 200,
  minHeight = 160,
): LayoutRect | null {
  if (points.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x + NODE_WIDTH);
    maxY = Math.max(maxY, point.y + FME_NODE_ESTIMATED_HEIGHT);
  }

  return {
    position: { x: minX - padding, y: minY - padding },
    size: {
      width: Math.max(minWidth, maxX - minX + padding * 2),
      height: Math.max(minHeight, maxY - minY + padding * 2),
    },
  };
}

const GENERIC_TRANSFORMER_TYPES = new Set([
  'tester',
  'testfilter',
  'bufferer',
  'buffer',
  'reprojector',
  'csmapreprojector',
  'attributemanager',
  'attributecopier',
  'attributekeeper',
  'attributerenamer',
  'clipper',
  'dissolver',
  'areabuilder',
  'featurewriter',
  'featuretypefilter',
  'spatialfilter',
  'topologyvalidator',
]);

export function resolveFmeDisplayName(
  attrs: string,
  block: string,
  fallbackId: string,
): string {
  const source = `${attrs}\n${block}`;
  const candidates = [
    extractAttr(attrs, 'NODE_NAME'),
    extractAttr(source, 'NODE_NAME'),
    extractAttr(attrs, 'OBJECT_NAME'),
    extractAttr(source, 'OBJECT_NAME'),
    extractAttr(attrs, 'USER_NAME'),
    extractAttr(source, 'USER_NAME'),
    extractAttr(attrs, 'INSTANCE_NAME'),
    extractQuoted(source, /GUIF_OBJECT\s+"([^"]+)"/i),
    extractQuoted(source, /FACTORY_NAME\s+"([^"]+)"/i),
    extractQuoted(source, /(?:OBJECT_NAME|NAME)\s+"([^"]+)"/i),
    extractAttr(attrs, 'TRANSFORMER_NAME'),
    extractAttr(source, 'TRANSFORMER_NAME'),
    extractAttr(attrs, 'PLUGIN_NAME'),
    extractAttr(source, 'PLUGIN_NAME'),
    extractAttr(attrs, 'NAME'),
    extractToken(source, /NODE_NAME\s+(\S+)/i),
    extractToken(source, /TRANSFORMER_NAME\s+(\S+)/i),
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    const normalized = trimmed.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (!GENERIC_TRANSFORMER_TYPES.has(normalized)) {
      return trimmed;
    }
  }

  const lastCandidate = candidates[candidates.length - 1]?.trim();
  if (lastCandidate) {
    return lastCandidate;
  }

  return `node_${fallbackId}`;
}

export function resolveFeatureTypeName(attrs: string): string {
  const nodeName = extractAttr(attrs, 'NODE_NAME');
  const qualifier = extractAttr(attrs, 'FEATURE_TYPE_NAME_QUALIFIER');
  const featureTypeName = extractAttr(attrs, 'FEATURE_TYPE_NAME');

  if (nodeName) {
    if (qualifier && qualifier !== nodeName) {
      return `${qualifier}.${nodeName}`;
    }
    return nodeName;
  }

  if (featureTypeName) {
    return featureTypeName;
  }

  const identifier = extractAttr(attrs, 'IDENTIFIER');
  return identifier ? `feature_${identifier}` : 'feature_type';
}

export function mapFmePortId(
  portDesc: string | undefined,
  nodeType: string,
  side: 'source' | 'target',
): string | undefined {
  if (!portDesc || portDesc === '-1') {
    return undefined;
  }

  const index = Number(portDesc);
  if (!Number.isFinite(index)) {
    const lowered = portDesc.toLowerCase().trim();
    const canonical = lowered.replace(/[^a-z]/g, '');
    const direct: Record<string, string> = {
      input: 'input',
      output: 'output',
      passed: 'passed',
      pass: 'passed',
      failed: 'failed',
      fail: 'failed',
      rejected: 'rejected',
      reject: 'rejected',
      summary: 'summary',
    };
    if (direct[canonical]) {
      return direct[canonical];
    }
    if (lowered.includes('pass') || lowered.includes('output')) {
      return side === 'source' ? (nodeType === 'reader' ? 'output' : 'passed') : 'input';
    }
    if (lowered.includes('fail') || lowered.includes('reject')) {
      return side === 'source' ? 'failed' : 'input';
    }
    if (lowered.includes('input')) {
      return 'input';
    }
    if (lowered.includes('summary')) {
      return 'summary';
    }
    return undefined;
  }

  if (side === 'target') {
    return 'input';
  }

  if (nodeType === 'tester' || nodeType === 'topology_validator') {
    return index <= 0 ? 'passed' : 'failed';
  }

  if (nodeType === 'writer') {
    return index <= 0 ? 'output' : 'summary';
  }

  return index <= 0 ? 'output' : 'rejected';
}

function extractAttr(snippet: string, name: string): string | null {
  const pattern = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i');
  const match = snippet.match(pattern);
  return match?.[1] ?? null;
}

function extractQuoted(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match?.[1] ?? null;
}

function extractToken(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match?.[1] ?? null;
}
