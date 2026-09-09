import type { Feature, FeatureCollection } from 'geojson';
import type { FilterCondition } from '../editor-node-config.types';
import type { EtlDataset, TransformerContext } from '../etl.types';

function matchesCondition(feature: Feature, condition: FilterCondition): boolean {
  const raw = feature.properties?.[condition.attribute];

  switch (condition.operator) {
    case 'is_not_null':
      return raw != null && raw !== '';
    case 'like':
      return String(raw ?? '')
        .toLowerCase()
        .includes(String(condition.value).toLowerCase());
    case '>':
      return Number(raw) > Number(condition.value);
    case '<':
      return Number(raw) < Number(condition.value);
    default:
      return String(raw ?? '') === String(condition.value);
  }
}

function featureMatchesAll(feature: Feature, conditions: FilterCondition[]): boolean {
  if (conditions.length === 0) {
    return true;
  }
  return conditions.every((condition) => matchesCondition(feature, condition));
}

export function testerDataset(context: TransformerContext): EtlDataset {
  const conditions = (context.node.config['conditions'] as FilterCondition[] | undefined) ?? [];
  const inputCount = context.input.collection.features.length;
  const features = context.input.collection.features.filter((feature) =>
    featureMatchesAll(feature, conditions),
  );

  const collection: FeatureCollection = { type: 'FeatureCollection', features };

  return {
    collection,
    srid: context.input.srid,
    meta: {
      ...context.input.meta,
      filteredOut: inputCount - features.length,
      featureCount: features.length,
    },
  };
}
