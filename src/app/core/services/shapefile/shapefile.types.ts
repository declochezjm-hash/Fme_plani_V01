import type { FeatureCollection } from "geojson";

export type ShapefileFieldType =
	| "string"
	| "number"
	| "date"
	| "boolean"
	| "geometry";

export interface ShapefileAttributeField {
	name: string;
	type: ShapefileFieldType;
	dbfType?: string;
	length?: number;
	decimals?: number;
}

export interface ShapefileReadResult {
	layerName: string;
	archiveName: string;
	collection: FeatureCollection;
	attributes: ShapefileAttributeField[];
	featureCount: number;
	fileBase64: string;
}
