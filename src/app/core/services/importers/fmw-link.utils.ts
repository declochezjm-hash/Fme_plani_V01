import { mapFmePortId } from './fmw-layout.utils';
import type { FmwLink } from './fmw-importer.types';

const GISFORGE_PORT_ALIASES: Record<string, string> = {
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

function defaultGisForgePort(nodeType: string, side: 'source' | 'target'): string {
  if (side === 'target') {
    return 'input';
  }
  if (nodeType === 'tester' || nodeType === 'topology_validator') {
    return 'passed';
  }
  if (nodeType === 'writer') {
    return 'output';
  }
  return 'output';
}

/** Résolution ultra-tolérante d'un port FME vers un identifiant GisForge. */
export function resolveGisForgePortId(
  portDesc: string | undefined,
  nodeType: string,
  side: 'source' | 'target',
): string {
  const mapped = mapFmePortId(portDesc, nodeType, side);
  if (mapped) {
    return mapped;
  }

  if (portDesc && portDesc !== '-1') {
    const normalized = portDesc.toLowerCase().replace(/[^a-z]/g, '');
    const alias = GISFORGE_PORT_ALIASES[normalized];
    if (alias) {
      return alias;
    }

    for (const [key, id] of Object.entries(GISFORGE_PORT_ALIASES)) {
      if (normalized.includes(key)) {
        return id;
      }
    }
  }

  return defaultGisForgePort(nodeType, side);
}

function normalizePort(port?: string): string | undefined {
  if (!port || port === '-1') {
    return undefined;
  }
  return port;
}

export function mergeFmwLinks(links: FmwLink[]): FmwLink[] {
  const deduped = new Map<string, FmwLink>();
  for (const link of links) {
    const normalized: FmwLink = {
      ...link,
      sourcePort: normalizePort(link.sourcePort),
      targetPort: normalizePort(link.targetPort),
    };
    const key = linkKey(normalized);
    if (!deduped.has(key)) {
      deduped.set(key, normalized);
    }
  }
  return [...deduped.values()];
}

export function linkKey(link: FmwLink): string {
  const sourcePort = normalizePort(link.sourcePort) ?? '';
  const targetPort = normalizePort(link.targetPort) ?? '';
  return `${link.sourceId}|${link.targetId}|${sourcePort}|${targetPort}`;
}
