import type { FeatureCollection } from 'geojson';
import type { EtlPipelineJson, EtlPipelineNode } from '../../copilot/copilot.types';

export type ReaderFormat = 'geojson' | 'shapefile' | 'geopackage' | 'csv' | 'json' | 'ifc';

export type TransformerType = 'reproject' | 'buffer' | 'topology_validator' | 'tester' | 'clip';

const IO_DEFAULTS = {
  tableName: 'features',
  schema: 'public',
  featureOperation: 'insert',
  tableHandling: 'use_existing',
  sourceSrid: 4326,
  targetSrid: 4326,
  attributeMode: 'automatic',
  userAttributes: [],
};

export interface EtlNodePort {
  id: string;
  label: string;
  type: 'source' | 'target';
}

export interface EtlDataset {
  collection: FeatureCollection;
  srid: number;
  meta: Record<string, unknown>;
}

export interface PipelineRunMetrics {
  rowsRead: number;
  rowsWritten: number;
  durationMs: number;
  nodeResults: Record<string, { featureCount: number; message?: string }>;
}

export interface PipelineRunResult {
  output: EtlDataset | null;
  intermediates: Record<string, EtlDataset>;
  metrics: PipelineRunMetrics;
  logs: string[];
}

export interface ReaderContext {
  node: EtlPipelineNode;
  defaultSrid: number;
}

export interface TransformerContext {
  node: EtlPipelineNode;
  input: EtlDataset;
  defaultSrid: number;
}

export const NODE_CATALOG: Array<{
  type: string;
  label: string;
  category: 'reader' | 'transformer' | 'writer';
  defaultConfig: Record<string, unknown>;
}> = [
  {
    type: 'reader',
    label: 'Lecture GeoJSON',
    category: 'reader',
    defaultConfig: { format: 'geojson', inline: null, ...IO_DEFAULTS },
  },
  {
    type: 'reader',
    label: 'Lecture Shapefile',
    category: 'reader',
    defaultConfig: { format: 'shapefile', ...IO_DEFAULTS },
  },
  {
    type: 'reader',
    label: 'Lecture GeoPackage',
    category: 'reader',
    defaultConfig: { format: 'geopackage', table: 'features', ...IO_DEFAULTS, tableName: 'features' },
  },
  {
    type: 'reader',
    label: 'Lecture CSV',
    category: 'reader',
    defaultConfig: { format: 'csv', latField: 'lat', lonField: 'lon', ...IO_DEFAULTS },
  },
  {
    type: 'reader',
    label: 'Lecture JSON',
    category: 'reader',
    defaultConfig: { format: 'json', ...IO_DEFAULTS },
  },
  {
    type: 'reader',
    label: 'Lecture IFC/BIM',
    category: 'reader',
    defaultConfig: { format: 'ifc', ...IO_DEFAULTS },
  },
  {
    type: 'reproject',
    label: 'Reprojection',
    category: 'transformer',
    defaultConfig: { source_srid: 4326, target_srid: 2154, sourceSrid: 4326, targetSrid: 2154 },
  },
  {
    type: 'buffer',
    label: 'Tampon spatial',
    category: 'transformer',
    defaultConfig: { distance: 50, unit: 'meters', dissolve: false, distance_m: 50 },
  },
  {
    type: 'topology_validator',
    label: 'Validateur topologie',
    category: 'transformer',
    defaultConfig: {
      heal: true,
      conditions: [{ attribute: 'geom', operator: 'is_not_null', value: '' }],
    },
  },
  {
    type: 'tester',
    label: 'Filtre / Tester',
    category: 'transformer',
    defaultConfig: {
      conditions: [{ attribute: 'name', operator: '=', value: '' }],
    },
  },
  {
    type: 'clip',
    label: 'Découpage',
    category: 'transformer',
    defaultConfig: {},
  },
  {
    type: 'writer',
    label: 'FeatureWriter',
    category: 'writer',
    defaultConfig: { format: 'geojson', ...IO_DEFAULTS },
  },
];

export const DEFAULT_DEMO_PIPELINE: EtlPipelineJson = {
  version: 1,
  nodes: [
    {
      id: 'reader-1',
      type: 'reader',
      label: 'Points démo',
      config: {
        format: 'geojson',
        inline: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { name: 'Paris' },
              geometry: { type: 'Point', coordinates: [2.3522, 48.8566] },
            },
            {
              type: 'Feature',
              properties: { name: 'Lyon' },
              geometry: { type: 'Point', coordinates: [4.8357, 45.764] },
            },
          ],
        },
      },
      position: { x: 60, y: 140 },
    },
    {
      id: 'buffer-1',
      type: 'buffer',
      label: 'Tampon 5 km',
      config: { distance_m: 5000 },
      position: { x: 320, y: 140 },
    },
    {
      id: 'reproject-1',
      type: 'reproject',
      label: 'EPSG:2154',
      config: { source_srid: 4326, target_srid: 2154 },
      position: { x: 580, y: 140 },
    },
    {
      id: 'topology-1',
      type: 'topology_validator',
      label: 'Nettoyage',
      config: { heal: true },
      position: { x: 840, y: 140 },
    },
    {
      id: 'writer-1',
      type: 'writer',
      label: 'Sortie PostGIS',
      config: {
        format: 'postgis',
        tableName: 'features',
        schema: '$(PG_SCHEMA)',
        featureOperation: 'insert',
        tableHandling: 'create_if_needed',
        postgisConnection: {
          host: '$(PG_HOST)',
          port: 5432,
          database: '$(PG_DATABASE)',
          username: '$(PG_USER)',
          password: '$(PG_PASSWORD)',
          sslMode: 'prefer',
        },
        postgisTableCreation: {
          spatialColumnType: 'geometry',
          spatialColumnName: 'geom',
          createGenericSpatialColumns: false,
          lowerCaseAttributeNames: true,
        },
        formatAttributes: [
          { exposed: true, name: 'fme_basename', type: 'char(50)' },
          { exposed: true, name: 'fme_color', type: 'float8' },
          { exposed: true, name: 'fme_geometry', type: 'int4' },
          { exposed: false, name: 'postgis_type', type: 'char(50)' },
        ],
        featureTypes: [
          { id: 'ft-default', name: 'features', tableName: 'features', schema: '$(PG_SCHEMA)' },
        ],
      },
      position: { x: 1100, y: 140 },
    },
  ],
  edges: [
    { id: 'e1', source: 'reader-1', target: 'buffer-1' },
    { id: 'e2', source: 'buffer-1', target: 'reproject-1' },
    { id: 'e3', source: 'reproject-1', target: 'topology-1' },
    { id: 'e4', source: 'topology-1', target: 'writer-1' },
  ],
  groups: [
    {
      id: 'group-clean',
      label: 'Nettoyage Cadastre',
      color: '#6b21a8',
      position: { x: 24, y: 88 },
      size: { width: 520, height: 220 },
    },
    {
      id: 'group-spatial',
      label: 'Calculs Spatiaux',
      color: '#0284c7',
      position: { x: 560, y: 88 },
      size: { width: 640, height: 220 },
    },
  ],
};
