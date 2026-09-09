import type { FeatureCollection } from "geojson";

export type RasterGeorefSource =
	| "world_file"
	| "exif_gps"
	| "prj_only"
	| "default";

export interface WorldFileParams {
	pixelSizeX: number;
	rotationD: number;
	rotationB: number;
	pixelSizeY: number;
	originX: number;
	originY: number;
}

export interface RasterBoundingBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface RasterFmeAttributes {
	fme_basename: string;
	fme_format_short_name: string;
	raster_width: number;
	raster_height: number;
	raster_num_bands: number;
	raster_pixel_size_x: number;
	raster_pixel_size_y: number;
	coordinate_system: string;
	fme_geometry: "fme_raster" | "fme_polygon";
}

export interface RasterReadResult {
	imageName: string;
	imageMime: string;
	imageBuffer: ArrayBuffer;
	imageDataUrl: string;
	width: number;
	height: number;
	numBands: number;
	srid: number;
	georefSource: RasterGeorefSource;
	worldFile?: WorldFileParams;
	bbox: RasterBoundingBox;
	bboxWgs84: RasterBoundingBox;
	attributes: RasterFmeAttributes;
	previewCollection: FeatureCollection;
	overlayCoordinates: [
		[number, number],
		[number, number],
		[number, number],
		[number, number],
	];
}

export interface MapRasterOverlay {
	url: string;
	coordinates: [
		[number, number],
		[number, number],
		[number, number],
		[number, number],
	];
}
