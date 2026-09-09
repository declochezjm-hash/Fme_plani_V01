import type { Feature, Polygon, Position } from "geojson";
import proj4 from "proj4";
import type { RasterBoundingBox } from "./raster.types";

const EPSG_DEFS: Record<number, string> = {
	4326: "+proj=longlat +datum=WGS84 +no_defs",
	2154: "+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
	3857: "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs",
};

export function ensureProjection(epsg: number): string {
	const key = `EPSG:${epsg}`;
	if (!proj4.defs(key)) {
		const def = EPSG_DEFS[epsg];
		if (!def) {
			throw new Error(
				`EPSG:${epsg} non supporté — ajoutez la définition proj4.`,
			);
		}
		proj4.defs(key, def);
	}
	return key;
}

export function reprojectPoint(
	x: number,
	y: number,
	fromEpsg: number,
	toEpsg = 4326,
): [number, number] {
	const from = ensureProjection(fromEpsg);
	const to = ensureProjection(toEpsg);
	const [lon, lat] = proj4(from, to, [x, y]) as [number, number];
	return [lon, lat];
}

export function reprojectBoundingBox(
	bbox: RasterBoundingBox,
	fromEpsg: number,
	toEpsg = 4326,
): RasterBoundingBox {
	const corners = [
		reprojectPoint(bbox.minX, bbox.minY, fromEpsg, toEpsg),
		reprojectPoint(bbox.minX, bbox.maxY, fromEpsg, toEpsg),
		reprojectPoint(bbox.maxX, bbox.minY, fromEpsg, toEpsg),
		reprojectPoint(bbox.maxX, bbox.maxY, fromEpsg, toEpsg),
	];

	const xs = corners.map(([x]) => x);
	const ys = corners.map(([, y]) => y);
	return {
		minX: Math.min(...xs),
		minY: Math.min(...ys),
		maxX: Math.max(...xs),
		maxY: Math.max(...ys),
	};
}

export function bboxToPolygon(bbox: RasterBoundingBox): Polygon {
	return {
		type: "Polygon",
		coordinates: [
			[
				[bbox.minX, bbox.minY],
				[bbox.maxX, bbox.minY],
				[bbox.maxX, bbox.maxY],
				[bbox.minX, bbox.maxY],
				[bbox.minX, bbox.minY],
			],
		],
	};
}

export function bboxToWgs84OverlayCoordinates(
	bboxWgs84: RasterBoundingBox,
): [[number, number], [number, number], [number, number], [number, number]] {
	const { minX: west, minY: south, maxX: east, maxY: north } = bboxWgs84;
	return [
		[west, north],
		[east, north],
		[east, south],
		[west, south],
	];
}

export function bboxToPreviewFeature(
	bbox: RasterBoundingBox,
	properties: Record<string, unknown>,
): Feature {
	return {
		type: "Feature",
		properties,
		geometry: bboxToPolygon(bbox),
	};
}

export function epsgFromPrjWkt(wkt: string): number | null {
	const authority = wkt.match(/AUTHORITY\["EPSG","(\d+)"\]/i);
	if (authority) {
		return Number(authority[1]);
	}

	const upper = wkt.toUpperCase();
	if (upper.includes("LAMBERT-93") || upper.includes("RGF93")) {
		return 2154;
	}
	if (upper.includes("WGS 84") || upper.includes("WGS_1984")) {
		return 4326;
	}
	if (upper.includes("WEB MERCATOR") || upper.includes("PSEUDO-MERCATOR")) {
		return 3857;
	}

	return null;
}

export function defaultEpsgForCoordinates(x: number, y: number): number {
	if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
		return 4326;
	}
	return 2154;
}

export function pointBufferBbox(
	lon: number,
	lat: number,
	bufferDegrees = 0.001,
): RasterBoundingBox {
	return {
		minX: lon - bufferDegrees,
		minY: lat - bufferDegrees,
		maxX: lon + bufferDegrees,
		maxY: lat + bufferDegrees,
	};
}

export function reprojectPolygonToWgs84(
	polygon: Polygon,
	fromEpsg: number,
): Polygon {
	const ring = polygon.coordinates[0] ?? [];
	const projected: Position[] = ring.map(([x, y]) => {
		const [lon, lat] = reprojectPoint(x, y, fromEpsg, 4326);
		return [lon, lat];
	});
	return { type: "Polygon", coordinates: [projected] };
}
