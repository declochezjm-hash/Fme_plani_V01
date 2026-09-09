export type InspectedFileCategory =
	| "vector"
	| "tabular"
	| "raster"
	| "project"
	| "unknown";

export interface InspectedAttribute {
	name: string;
	type: string;
}

export interface FileInspectionResult {
	fileName: string;
	extension: string;
	format: string;
	category: InspectedFileCategory;
	sizeBytes: number;
	layers: string[];
	attributes: InspectedAttribute[];
	geometryType?: string;
	hasGeometry: boolean;
	hasCoordinates: boolean;
	coordinateFields?: { x?: string; y?: string };
	crs?: string;
	featureCount?: number;
	readerFormat?: string;
}

export interface CopilotActionChip {
	id: string;
	label: string;
	prompt: string;
}
