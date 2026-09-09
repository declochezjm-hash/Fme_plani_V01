import { Injectable, inject } from "@angular/core";
import Papa from "papaparse";
import { RasterReaderService } from "../raster/raster-reader.service";
import { ShapefileReaderService } from "../shapefile/shapefile-reader.service";
import { ZipExtractorService } from "../zip/zip-extractor.service";
import type {
	FileInspectionResult,
	InspectedAttribute,
	InspectedFileCategory,
} from "./file-inspection.types";
import { isProjectDropFile } from "./smart-file-drop.utils";

const XY_FIELD_CANDIDATES = {
	x: ["x", "lon", "longitude", "long", "easting"],
	y: ["y", "lat", "latitude", "northing"],
};

@Injectable({ providedIn: "root" })
export class FileInspectionService {
	private readonly zipExtractor = inject(ZipExtractorService);
	private readonly rasterReader = inject(RasterReaderService);
	private readonly shapefileReader = inject(ShapefileReaderService);

	async inspectFromArrayBuffer(
		file: File,
		buffer: ArrayBuffer,
	): Promise<FileInspectionResult> {
		const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
		const base: FileInspectionResult = {
			fileName: file.name,
			extension,
			format: this.formatLabel(extension),
			category: this.categoryFromExtension(extension),
			sizeBytes: file.size,
			layers: [],
			attributes: [],
			hasGeometry: false,
			hasCoordinates: false,
		};

		if (extension === "zip") {
			return this.inspectZipArchive(file, base, buffer);
		}

		if (extension === "gpkg") {
			return this.inspectGeoPackage(file, base, buffer);
		}

		if (extension === "shp") {
			return this.inspectShapefile(file, base);
		}

		return this.inspect(file);
	}

	async inspect(file: File): Promise<FileInspectionResult> {
		const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
		const base: FileInspectionResult = {
			fileName: file.name,
			extension,
			format: this.formatLabel(extension),
			category: this.categoryFromExtension(extension),
			sizeBytes: file.size,
			layers: [],
			attributes: [],
			hasGeometry: false,
			hasCoordinates: false,
		};

		if (isProjectDropFile(file)) {
			return { ...base, category: "project", format: extension.toUpperCase() };
		}

		switch (extension) {
			case "geojson":
			case "json":
				return this.inspectGeoJson(file, base);
			case "csv":
				return this.inspectCsv(file, base);
			case "gpkg":
				return this.inspectGeoPackage(file, base);
			case "shp":
				return this.inspectShapefile(file, base);
			case "zip":
				return this.inspectZipArchive(file, base, await file.arrayBuffer());
			case "xlsx":
				return this.inspectSpreadsheet(file, base);
			case "parquet":
				return this.inspectParquet(file, base);
			case "tif":
			case "tiff":
			case "jpg":
			case "jpeg":
			case "png":
				return this.inspectRasterFile(file, base);
			default:
				return base;
		}
	}

	private formatLabel(extension: string): string {
		const labels: Record<string, string> = {
			geojson: "GeoJSON",
			json: "JSON",
			csv: "CSV",
			gpkg: "GeoPackage",
			shp: "Shapefile",
			zip: "Archive ZIP",
			xlsx: "Excel",
			parquet: "Parquet",
			tif: "GeoTIFF",
			tiff: "GeoTIFF",
			jpg: "JPEG",
			jpeg: "JPEG",
			png: "PNG",
		};
		return labels[extension] ?? extension.toUpperCase();
	}

	private categoryFromExtension(extension: string): InspectedFileCategory {
		if (["geojson", "json", "gpkg", "shp"].includes(extension)) {
			return "vector";
		}
		if (extension === "zip") {
			return "unknown";
		}
		if (["csv", "xlsx", "parquet"].includes(extension)) {
			return "tabular";
		}
		if (["tif", "tiff", "jpg", "jpeg", "png"].includes(extension)) {
			return "raster";
		}
		return "unknown";
	}

	private async inspectZipArchive(
		file: File,
		base: FileInspectionResult,
		buffer?: ArrayBuffer,
	): Promise<FileInspectionResult> {
		const extraction = buffer
			? await this.zipExtractor.extractFromBuffer(buffer, file.name)
			: await this.zipExtractor.extractFromFile(file);

		if (extraction.kind === "raster" && extraction.raster) {
			const raster = await this.rasterReader.readFromZipBundle(
				extraction.raster,
			);
			return {
				...base,
				fileName: raster.imageName,
				extension:
					raster.imageName.split(".").pop()?.toLowerCase() ?? base.extension,
				format: raster.attributes.fme_format_short_name,
				category: "raster",
				readerFormat: "raster",
				layers: [raster.imageName],
				attributes: this.rasterReader.fmeAttributesToInspection(
					raster.attributes,
				),
				hasGeometry: true,
				geometryType: raster.attributes.fme_geometry,
				crs: raster.attributes.coordinate_system,
				featureCount: 1,
			};
		}

		if (extraction.kind === "shapefile") {
			const buffer = await file.arrayBuffer();
			const shapefile = await this.shapefileReader.inspectZipBuffer(
				buffer,
				file.name,
			);
			return {
				...base,
				fileName: shapefile.layerName,
				category: "vector",
				readerFormat: "shapefile",
				format: "Shapefile",
				layers: [shapefile.layerName],
				attributes: this.shapefileReader.attributesToInspection(
					shapefile.attributes,
				),
				hasGeometry: true,
				geometryType: "Geometry",
				crs: "À confirmer à l'import",
				featureCount: shapefile.featureCount,
			};
		}

		return {
			...base,
			category: "unknown",
			format: "Archive ZIP",
			layers: extraction.entries.map((entry) => entry.name).slice(0, 8),
			crs: "Contenu non reconnu",
		};
	}

	private async inspectRasterFile(
		file: File,
		base: FileInspectionResult,
	): Promise<FileInspectionResult> {
		const raster = await this.rasterReader.readFromFile(file);
		return {
			...base,
			fileName: raster.imageName,
			format: raster.attributes.fme_format_short_name,
			category: "raster",
			readerFormat: "raster",
			layers: [raster.imageName],
			attributes: this.rasterReader.fmeAttributesToInspection(
				raster.attributes,
			),
			hasGeometry: true,
			geometryType: raster.attributes.fme_geometry,
			crs: raster.attributes.coordinate_system,
			featureCount: 1,
		};
	}

	private async inspectGeoJson(
		file: File,
		base: FileInspectionResult,
	): Promise<FileInspectionResult> {
		try {
			const text = await file.text();
			const data = JSON.parse(text) as {
				type?: string;
				features?: Array<{
					geometry?: { type?: string };
					properties?: Record<string, unknown>;
				}>;
				crs?: { properties?: { name?: string } };
			};

			if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
				const sample = data.features[0];
				const attributes = this.attributesFromProperties(
					sample?.properties ?? {},
				);
				const geometryType = sample?.geometry?.type;
				const crs = data.crs?.properties?.name;

				return {
					...base,
					category: "vector",
					readerFormat: "geojson",
					layers: ["features"],
					attributes,
					hasGeometry: !!geometryType,
					geometryType,
					featureCount: data.features.length,
					crs: crs ?? this.guessCrsFromCoordinates(sample?.geometry),
				};
			}
		} catch {
			// fallback to base metadata
		}

		return { ...base, readerFormat: "geojson" };
	}

	private async inspectCsv(
		file: File,
		base: FileInspectionResult,
	): Promise<FileInspectionResult> {
		const text = await file.text();
		const parsed = Papa.parse<Record<string, string>>(text, {
			header: true,
			preview: 20,
			skipEmptyLines: true,
		});

		const fields = parsed.meta.fields ?? [];
		const attributes = fields.map((name) => ({
			name,
			type: this.guessTypeFromValues(parsed.data.map((row) => row[name])),
		}));

		const coordinateFields = this.detectCoordinateFields(fields);
		const hasCoordinates = !!coordinateFields.x && !!coordinateFields.y;

		return {
			...base,
			category: "tabular",
			readerFormat: "csv",
			layers: ["sheet"],
			attributes,
			hasCoordinates,
			hasGeometry: hasCoordinates,
			geometryType: hasCoordinates ? "Point" : undefined,
			coordinateFields,
			featureCount: parsed.data.length,
			crs: hasCoordinates ? "EPSG:4326 (supposé)" : undefined,
		};
	}

	private inspectGeoPackage(
		file: File,
		base: FileInspectionResult,
		_buffer?: ArrayBuffer,
	): FileInspectionResult {
		const layerName = file.name.replace(/\.gpkg$/i, "");
		return {
			...base,
			category: "vector",
			readerFormat: "geopackage",
			layers: [layerName, "features"],
			attributes: [
				{ name: "geom", type: "geometry" },
				{ name: "id", type: "integer" },
			],
			hasGeometry: true,
			geometryType: "Geometry",
			crs: "À confirmer à l'import (lu en mémoire)",
		};
	}

	private inspectShapefile(
		file: File,
		base: FileInspectionResult,
	): FileInspectionResult {
		const layerName = file.name.replace(/\.(zip|shp)$/i, "");
		return {
			...base,
			category: "vector",
			readerFormat: "shapefile",
			layers: [layerName],
			attributes: [
				{ name: "geom", type: "geometry" },
				{ name: "NAME", type: "string" },
			],
			hasGeometry: true,
			geometryType: "Geometry",
			crs: "Archive .zip requise (.shp + .dbf + .shx)",
		};
	}

	private inspectSpreadsheet(
		_file: File,
		base: FileInspectionResult,
	): FileInspectionResult {
		return {
			...base,
			category: "tabular",
			readerFormat: "csv",
			layers: ["Feuille1"],
			attributes: [
				{ name: "X", type: "number" },
				{ name: "Y", type: "number" },
				{ name: "Attribut", type: "string" },
			],
			hasCoordinates: true,
			hasGeometry: false,
			coordinateFields: { x: "X", y: "Y" },
			crs: "EPSG:4326 (supposé après conversion X/Y)",
		};
	}

	private inspectParquet(
		_file: File,
		base: FileInspectionResult,
	): FileInspectionResult {
		return {
			...base,
			category: "tabular",
			layers: ["dataset"],
			attributes: [
				{ name: "geometry", type: "binary" },
				{ name: "attributes", type: "struct" },
			],
			hasGeometry: true,
			geometryType: "Unknown",
			crs: "À détecter à l'import",
		};
	}

	private attributesFromProperties(
		properties: Record<string, unknown>,
	): InspectedAttribute[] {
		return Object.entries(properties)
			.slice(0, 12)
			.map(([name, value]) => ({
				name,
				type:
					typeof value === "number"
						? "number"
						: typeof value === "boolean"
							? "boolean"
							: "string",
			}));
	}

	private guessTypeFromValues(values: Array<string | undefined>): string {
		const sample = values.find((value) => value != null && value !== "");
		if (!sample) {
			return "string";
		}
		const numeric = Number(sample);
		if (Number.isFinite(numeric)) {
			return "number";
		}
		return "string";
	}

	private detectCoordinateFields(fields: string[]): { x?: string; y?: string } {
		const normalized = fields.map((field) => ({
			raw: field,
			lower: field.toLowerCase(),
		}));
		const x = normalized.find((field) =>
			XY_FIELD_CANDIDATES.x.includes(field.lower),
		)?.raw;
		const y = normalized.find((field) =>
			XY_FIELD_CANDIDATES.y.includes(field.lower),
		)?.raw;
		return { x, y };
	}

	private guessCrsFromCoordinates(geometry?: {
		type?: string;
		coordinates?: unknown;
	}): string | undefined {
		if (!geometry?.coordinates || !Array.isArray(geometry.coordinates)) {
			return undefined;
		}
		const pair = geometry.coordinates as number[];
		if (
			pair.length >= 2 &&
			Math.abs(pair[0]) <= 180 &&
			Math.abs(pair[1]) <= 90
		) {
			return "EPSG:4326 (probable)";
		}
		if (pair.length >= 2 && Math.abs(pair[0]) > 180) {
			return "EPSG:2154 (probable)";
		}
		return undefined;
	}
}
