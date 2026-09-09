import type { EtlPipelineNode } from '../../copilot/copilot.types';
import type {
  AttributeDefinitionMode,
  BufferUnit,
  FeatureTypeDef,
  FilterCondition,
  FormatAttributeDef,
  IoFormat,
  PostgisConnectionConfig,
  PostgisTableCreationConfig,
  UserAttributeDef,
} from './editor-node-config.types';
import {
  DEFAULT_FORMAT_ATTRIBUTES,
  DEFAULT_POSTGIS_CONNECTION,
  DEFAULT_POSTGIS_TABLE_CREATION,
} from './editor-node-config.types';

export function bufferDistanceToMeters(distance: number, unit: BufferUnit): number {
  switch (unit) {
    case 'kilometers':
      return distance * 1000;
    case 'feet':
      return distance * 0.3048;
    default:
      return distance;
  }
}

export function mapLegacyFormat(format: unknown): IoFormat {
  if (format === 'postgis') {
    return 'postgis';
  }
  if (format === 'shapefile') {
    return 'shapefile';
  }
  if (format === 'geopackage') {
    return 'geopackage';
  }
  return 'geojson';
}

export function getUserAttributes(node: EtlPipelineNode): UserAttributeDef[] {
  const stored = node.config['userAttributes'];
  if (Array.isArray(stored) && stored.length > 0) {
    return stored as UserAttributeDef[];
  }

  if (node.type === 'reader') {
    const inline = node.config['inline'] as {
      features?: Array<{ properties?: Record<string, unknown> }>;
    };
    const keys = new Set<string>();
    inline?.features?.slice(0, 8).forEach((feature) => {
      Object.keys(feature.properties ?? {}).forEach((key) => keys.add(key));
    });
    return [
      ...Array.from(keys).map((name: string) => ({
        name,
        type: 'varchar' as const,
        width: 64,
        precision: 0,
        value: '',
        index: false,
      })),
      { name: 'geom', type: 'geometry', width: 0, precision: 0, value: '', index: true },
    ];
  }

  return [
    { name: 'geom', type: 'geometry', width: 0, precision: 0, value: '', index: true },
  ];
}

export function getFormatAttributes(node: EtlPipelineNode): FormatAttributeDef[] {
  const stored = node.config['formatAttributes'];
  if (Array.isArray(stored) && stored.length > 0) {
    return stored as FormatAttributeDef[];
  }
  return DEFAULT_FORMAT_ATTRIBUTES.map((item) => ({ ...item }));
}

export function getFeatureTypes(node: EtlPipelineNode): FeatureTypeDef[] {
  const stored = node.config['featureTypes'];
  if (Array.isArray(stored) && stored.length > 0) {
    return stored as FeatureTypeDef[];
  }
  const tableName = String(node.config['tableName'] ?? 'features');
  const schema = String(node.config['schema'] ?? 'public');
  return [{
    id: 'ft-default',
    name: tableName,
    tableName,
    schema,
  }];
}

export function getPostgisConnection(node: EtlPipelineNode): PostgisConnectionConfig {
  const stored = node.config['postgisConnection'] as PostgisConnectionConfig | undefined;
  return { ...DEFAULT_POSTGIS_CONNECTION, ...stored };
}

export function getPostgisTableCreation(node: EtlPipelineNode): PostgisTableCreationConfig {
  const stored = node.config['postgisTableCreation'] as PostgisTableCreationConfig | undefined;
  return { ...DEFAULT_POSTGIS_TABLE_CREATION, ...stored };
}

export function createDefaultFeatureType(node: EtlPipelineNode): FeatureTypeDef {
  const index = getFeatureTypes(node).length + 1;
  return {
    id: `ft-${crypto.randomUUID().slice(0, 8)}`,
    name: `FeatureType${index}`,
    tableName: `layer_${index}`,
    schema: String(node.config['schema'] ?? 'public'),
  };
}

export function getAttributeMode(node: EtlPipelineNode): AttributeDefinitionMode {
  const mode = node.config['attributeMode'];
  if (mode === 'manual' || mode === 'dynamic' || mode === 'automatic') {
    return mode;
  }
  return 'automatic';
}

export function createDefaultFilterCondition(): FilterCondition {
  return { attribute: 'name', operator: '=', value: '' };
}

export function createDefaultUserAttribute(): UserAttributeDef {
  return {
    name: 'new_field',
    type: 'varchar',
    width: 64,
    precision: 0,
    value: '',
    index: false,
  };
}

export function normalizeIoConfig(config: Record<string, unknown>): Record<string, unknown> {
  const format = mapLegacyFormat(config['format']);
  const distance = Number(config['distance'] ?? config['distance_m'] ?? 50);
  const unit = (config['unit'] as BufferUnit) ?? 'meters';

  return {
    ...config,
    format,
    tableName: String(config['tableName'] ?? config['table'] ?? 'features'),
    schema: String(config['schema'] ?? 'public'),
    featureOperation: config['featureOperation'] ?? 'insert',
    tableHandling: config['tableHandling'] ?? 'use_existing',
    sourceSrid: Number(config['sourceSrid'] ?? config['source_srid'] ?? 4326),
    targetSrid: Number(config['targetSrid'] ?? config['target_srid'] ?? 4326),
    attributeMode: config['attributeMode'] ?? 'automatic',
    userAttributes: Array.isArray(config['userAttributes']) ? config['userAttributes'] : [],
    formatAttributes: Array.isArray(config['formatAttributes'])
      ? config['formatAttributes']
      : DEFAULT_FORMAT_ATTRIBUTES,
    featureTypes: Array.isArray(config['featureTypes']) ? config['featureTypes'] : [],
    postgisConnection: {
      ...DEFAULT_POSTGIS_CONNECTION,
      ...(config['postgisConnection'] as PostgisConnectionConfig | undefined),
    },
    postgisTableCreation: {
      ...DEFAULT_POSTGIS_TABLE_CREATION,
      ...(config['postgisTableCreation'] as PostgisTableCreationConfig | undefined),
    },
    distance,
    unit,
    dissolve: config['dissolve'] === true,
    distance_m: bufferDistanceToMeters(distance, unit),
    source_srid: Number(config['source_srid'] ?? config['sourceSrid'] ?? 4326),
    target_srid: Number(config['target_srid'] ?? config['targetSrid'] ?? 2154),
    conditions: Array.isArray(config['conditions']) ? config['conditions'] : [createDefaultFilterCondition()],
  };
}

export function mergeNodeConfig(
  node: EtlPipelineNode,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = normalizeIoConfig({ ...node.config, ...patch });

  if ('distance' in patch || 'unit' in patch) {
    const distance = Number(merged['distance']);
    const unit = merged['unit'] as BufferUnit;
    merged['distance_m'] = bufferDistanceToMeters(distance, unit);
  }

  if ('sourceSrid' in patch) {
    merged['source_srid'] = merged['sourceSrid'];
  }
  if ('targetSrid' in patch) {
    merged['target_srid'] = merged['targetSrid'];
  }
  if ('source_srid' in patch) {
    merged['sourceSrid'] = merged['source_srid'];
  }
  if ('target_srid' in patch) {
    merged['targetSrid'] = merged['target_srid'];
  }

  return merged;
}
