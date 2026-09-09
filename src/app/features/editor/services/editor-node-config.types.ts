export type IoFormat = 'postgis' | 'geojson' | 'shapefile' | 'geopackage';

export type FeatureOperation = 'insert' | 'update' | 'delete';

export type TableHandling = 'use_existing' | 'create_if_needed' | 'truncate';

export type AttributeDefinitionMode = 'automatic' | 'manual' | 'dynamic';

export type UserAttributeType = 'varchar' | 'integer' | 'float' | 'date' | 'geometry';

export type BufferUnit = 'meters' | 'kilometers' | 'feet';

export type FilterOperator = '=' | '>' | '<' | 'like' | 'is_not_null';

export type SslMode = 'disable' | 'allow' | 'prefer' | 'require';

export type SpatialColumnType = 'geometry' | 'geography';

export interface PostgisConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: SslMode;
}

export interface PostgisTableCreationConfig {
  spatialColumnType: SpatialColumnType;
  spatialColumnName: string;
  createGenericSpatialColumns: boolean;
  lowerCaseAttributeNames: boolean;
}

export interface FeatureTypeDef {
  id: string;
  name: string;
  tableName: string;
  schema: string;
}

export interface FormatAttributeDef {
  exposed: boolean;
  name: string;
  type: string;
}

export interface UserAttributeDef {
  name: string;
  type: UserAttributeType;
  width: number;
  precision: number;
  value: string;
  index: boolean;
}

export interface FilterCondition {
  attribute: string;
  operator: FilterOperator;
  value: string;
}

export interface IoNodeConfig {
  format: IoFormat;
  tableName: string;
  schema: string;
  featureOperation: FeatureOperation;
  tableHandling: TableHandling;
  sourceSrid: number;
  targetSrid: number;
  attributeMode: AttributeDefinitionMode;
  userAttributes: UserAttributeDef[];
}

export interface BufferNodeConfig {
  distance: number;
  unit: BufferUnit;
  dissolve: boolean;
  distance_m: number;
}

export interface ReprojectNodeConfig {
  source_srid: number;
  target_srid: number;
}

export interface TesterNodeConfig {
  conditions: FilterCondition[];
}

export const EPSG_SUGGESTIONS = [
  { code: 4326, label: 'WGS 84' },
  { code: 2154, label: 'RGF93 / Lambert-93' },
  { code: 3857, label: 'Web Mercator' },
  { code: 32631, label: 'UTM 31N' },
  { code: 32632, label: 'UTM 32N' },
  { code: 4979, label: 'WGS 84 3D' },
] as const;

export const IO_FORMAT_OPTIONS: Array<{ value: IoFormat; label: string }> = [
  { value: 'postgis', label: 'PostGIS' },
  { value: 'geojson', label: 'GeoJSON' },
  { value: 'shapefile', label: 'Shapefile' },
  { value: 'geopackage', label: 'GeoPackage' },
];

export const FEATURE_OPERATION_OPTIONS: Array<{ value: FeatureOperation; label: string }> = [
  { value: 'insert', label: 'Insert' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
];

export const TABLE_HANDLING_OPTIONS: Array<{ value: TableHandling; label: string }> = [
  { value: 'use_existing', label: 'Use Existing' },
  { value: 'create_if_needed', label: 'Create If Needed' },
  { value: 'truncate', label: 'Truncate' },
];

export const BUFFER_UNIT_OPTIONS: Array<{ value: BufferUnit; label: string }> = [
  { value: 'meters', label: 'Meters' },
  { value: 'kilometers', label: 'Kilometers' },
  { value: 'feet', label: 'Feet' },
];

export const FILTER_OPERATOR_OPTIONS: Array<{ value: FilterOperator; label: string }> = [
  { value: '=', label: '=' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: 'like', label: 'LIKE' },
  { value: 'is_not_null', label: 'IS NOT NULL' },
];

export const USER_ATTRIBUTE_TYPE_OPTIONS: Array<{ value: UserAttributeType; label: string }> = [
  { value: 'varchar', label: 'varchar' },
  { value: 'integer', label: 'integer' },
  { value: 'float', label: 'float' },
  { value: 'date', label: 'date' },
  { value: 'geometry', label: 'geometry' },
];

export const ATTRIBUTE_MODE_OPTIONS: Array<{ value: AttributeDefinitionMode; label: string }> = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'manual', label: 'Manual' },
  { value: 'dynamic', label: 'Dynamic' },
];

export const SSL_MODE_OPTIONS: Array<{ value: SslMode; label: string }> = [
  { value: 'disable', label: 'Disable' },
  { value: 'allow', label: 'Allow' },
  { value: 'prefer', label: 'Prefer' },
  { value: 'require', label: 'Require' },
];

export const SPATIAL_COLUMN_TYPE_OPTIONS: Array<{ value: SpatialColumnType; label: string }> = [
  { value: 'geometry', label: 'geometry' },
  { value: 'geography', label: 'geography' },
];

export const FORMAT_ATTRIBUTE_TYPE_OPTIONS = [
  'char(50)',
  'float8',
  'int4',
  'varchar',
  'boolean',
  'geometry',
] as const;

export const MACRO_VARIABLE_SUGGESTIONS = [
  'PG_HOST',
  'PG_PORT',
  'PG_DATABASE',
  'PG_USER',
  'PG_PASSWORD',
  'PG_SCHEMA',
  'FME_HOME',
  'WORKSPACE',
] as const;

export const DEFAULT_FORMAT_ATTRIBUTES: FormatAttributeDef[] = [
  { exposed: true, name: 'fme_basename', type: 'char(50)' },
  { exposed: true, name: 'fme_color', type: 'float8' },
  { exposed: true, name: 'fme_geometry', type: 'int4' },
  { exposed: false, name: 'postgis_type', type: 'char(50)' },
];

export const DEFAULT_POSTGIS_CONNECTION: PostgisConnectionConfig = {
  host: '$(PG_HOST)',
  port: 5432,
  database: '$(PG_DATABASE)',
  username: '$(PG_USER)',
  password: '$(PG_PASSWORD)',
  sslMode: 'prefer',
};

export const DEFAULT_POSTGIS_TABLE_CREATION: PostgisTableCreationConfig = {
  spatialColumnType: 'geometry',
  spatialColumnName: 'geom',
  createGenericSpatialColumns: false,
  lowerCaseAttributeNames: true,
};
