import { Injectable } from "@angular/core";
import exifParser from "exif-parser";
import type { FeatureCollection } from "geojson";
import type { ZipRasterBundle } from "../zip/zip-extractor.service";
import type {
	RasterBoundingBox,
	RasterFmeAttributes,
	RasterGeorefSource,
	RasterReadResult,
	WorldFileParams,
} from "./raster.types";
import {
	bboxToPreviewFeature,
	bboxToWgs84OverlayCoordinates,
	defaultEpsgForCoordinates,
	epsgFromPrjWkt,
	pointBufferBbox,
	reprojectBoundingBox,
} from "./raster-projection.utils";

const MIME_BY_EXTENSION: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	tif: "image/tiff",
	tiff: "image/tiff",
};

@Injectable({ providedIn: "root" })
export class RasterReaderService {
	async readFromImageBuffer(
		imageName: string,
		imageBuffer: ArrayBuffer,
		options?: {
			worldFileText?: string;
			prjText?: string;
		},
	): Promise<RasterReadResult> {
		const extension = imageName.split(".").pop()?.toLowerCase() ?? "";
		const mime = MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
		const { width, height, numBands } = await this.readImageDimensions(
			imageBuffer,
			mime,
		);
		const imageDataUrl = this.toDataUrl(imageBuffer, mime);

		const basename = imageName.replace(/\.[^.]+$/i, "");
		const formatShort = this.formatShortName(extension);
		const worldFile = options?.worldFileText
			? this.parseWorldFile(options.worldFileText)
			: undefined;
		const prjEpsg = options?.prjText ? epsgFromPrjWkt(options.prjText) : null;

		let srid = prjEpsg ?? 2154;
		let georefSource: RasterGeorefSource = "default";
		let bbox: RasterBoundingBox;

		if (worldFile) {
			georefSource = "world_file";
			bbox = this.bboxFromWorldFile(worldFile, width, height);
			if (!prjEpsg) {
				srid = defaultEpsgForCoordinates(bbox.minX, bbox.maxY);
			}
		} else if (extension === "jpg" || extension === "jpeg") {
			const gps = this.readExifGps(imageBuffer);
			if (gps) {
				georefSource = "exif_gps";
				srid = 4326;
				bbox = pointBufferBbox(gps.longitude, gps.latitude);
			} else {
				bbox = this.fallbackBbox(width, height, srid);
			}
		} else {
			bbox = this.fallbackBbox(width, height, srid);
			if (prjEpsg) {
				georefSource = "prj_only";
			}
		}

		const bboxWgs84 =
			srid === 4326 ? bbox : reprojectBoundingBox(bbox, srid, 4326);
		const attributes = this.buildFmeAttributes({
			basename,
			formatShort,
			width,
			height,
			numBands,
			worldFile,
			srid,
			georefSource,
		});

		const previewCollection: FeatureCollection = {
			type: "FeatureCollection",
			features: [
				bboxToPreviewFeature(bboxWgs84, {
					...attributes,
					_raster_overlay: true,
				}),
			],
		};

		return {
			imageName,
			imageMime: mime,
			imageBuffer,
			imageDataUrl,
			width,
			height,
			numBands,
			srid,
			georefSource,
			worldFile,
			bbox,
			bboxWgs84,
			attributes,
			previewCollection,
			overlayCoordinates: bboxToWgs84OverlayCoordinates(bboxWgs84),
		};
	}

	async readFromZipBundle(bundle: ZipRasterBundle): Promise<RasterReadResult> {
		const worldFileText = bundle.worldFile
			? new TextDecoder().decode(bundle.worldFile.data)
			: undefined;
		const prjText = bundle.prjFile
			? new TextDecoder().decode(bundle.prjFile.data)
			: undefined;
		return this.readFromImageBuffer(bundle.image.name, bundle.image.data, {
			worldFileText,
			prjText,
		});
	}

	async readFromFile(
		file: File,
		worldFile?: File,
		prjFile?: File,
	): Promise<RasterReadResult> {
		const buffer = await file.arrayBuffer();
		const worldFileText = worldFile ? await worldFile.text() : undefined;
		const prjText = prjFile ? await prjFile.text() : undefined;
		return this.readFromImageBuffer(file.name, buffer, {
			worldFileText,
			prjText,
		});
	}

	parseWorldFile(text: string): WorldFileParams {
		const lines = text
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);

		if (lines.length < 6) {
			throw new Error("World File invalide : 6 lignes attendues.");
		}

		const values = lines.slice(0, 6).map((line) => Number(line));
		if (values.some((value) => !Number.isFinite(value))) {
			throw new Error("World File invalide : valeurs numériques attendues.");
		}

		return {
			pixelSizeX: values[0],
			rotationD: values[1],
			rotationB: values[2],
			pixelSizeY: values[3],
			originX: values[4],
			originY: values[5],
		};
	}

	bboxFromWorldFile(
		worldFile: WorldFileParams,
		width: number,
		height: number,
	): RasterBoundingBox {
		const { pixelSizeX: a, pixelSizeY: e, originX: c, originY: f } = worldFile;
		const xMin = c;
		const yMax = f;
		const xMax = c + width * a;
		const yMin = f + height * e;
		return {
			minX: Math.min(xMin, xMax),
			minY: Math.min(yMin, yMax),
			maxX: Math.max(xMin, xMax),
			maxY: Math.max(yMin, yMax),
		};
	}

	toReaderConfig(
		result: RasterReadResult,
		sourceFileName: string,
	): Record<string, unknown> {
		return {
			format: "raster",
			sourceFileName,
			rasterImageName: result.imageName,
			fileBase64: this.arrayBufferToBase64(result.imageBuffer),
			imageDataUrl: result.imageDataUrl,
			rasterMeta: result.attributes,
			rasterAttributes: Object.entries(result.attributes).map(
				([name, value]) => ({
					name,
					type: typeof value === "number" ? "number" : "string",
				}),
			),
			srid: result.srid,
			sourceSrid: result.srid,
			georefSource: result.georefSource,
			rasterBounds: result.bbox,
			rasterBoundsWgs84: result.bboxWgs84,
			rasterOverlay: {
				url: result.imageDataUrl,
				coordinates: result.overlayCoordinates,
			},
			inline: result.previewCollection,
			userAttributes: Object.entries(result.attributes).map(
				([name, value]) => ({
					name,
					type: typeof value === "number" ? "number" : "string",
					value: String(value),
				}),
			),
		};
	}

	fmeAttributesToInspection(
		attributes: RasterFmeAttributes,
	): Array<{ name: string; type: string }> {
		return Object.entries(attributes).map(([name, value]) => ({
			name,
			type: typeof value === "number" ? "number" : "string",
		}));
	}

	private buildFmeAttributes(input: {
		basename: string;
		formatShort: string;
		width: number;
		height: number;
		numBands: number;
		worldFile?: WorldFileParams;
		srid: number;
		georefSource: RasterGeorefSource;
	}): RasterFmeAttributes {
		const pixelX = input.worldFile ? Math.abs(input.worldFile.pixelSizeX) : 1;
		const pixelY = input.worldFile ? Math.abs(input.worldFile.pixelSizeY) : 1;
		const geometry =
			input.georefSource === "exif_gps" ? "fme_polygon" : "fme_raster";

		return {
			fme_basename: input.basename,
			fme_format_short_name: input.formatShort,
			raster_width: input.width,
			raster_height: input.height,
			raster_num_bands: input.numBands,
			raster_pixel_size_x: pixelX,
			raster_pixel_size_y: pixelY,
			coordinate_system: `EPSG:${input.srid}`,
			fme_geometry: geometry,
		};
	}

	private formatShortName(extension: string): string {
		switch (extension) {
			case "jpg":
			case "jpeg":
				return "JPEG";
			case "png":
				return "PNG";
			case "tif":
			case "tiff":
				return "GeoTIFF";
			default:
				return extension.toUpperCase();
		}
	}

	private async readImageDimensions(
		buffer: ArrayBuffer,
		mime: string,
	): Promise<{ width: number; height: number; numBands: number }> {
		const blob = new Blob([buffer], { type: mime });
		const url = URL.createObjectURL(blob);

		try {
			const image = new Image();
			await new Promise<void>((resolve, reject) => {
				image.onload = () => resolve();
				image.onerror = () =>
					reject(new Error("Impossible de lire les dimensions de l'image."));
				image.src = url;
			});

			const numBands = mime === "image/png" ? 4 : mime === "image/tiff" ? 1 : 3;
			return {
				width: image.naturalWidth,
				height: image.naturalHeight,
				numBands,
			};
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	private readExifGps(
		buffer: ArrayBuffer,
	): { latitude: number; longitude: number } | null {
		try {
			const parser = exifParser.create(buffer);
			const result = parser.parse();
			const tags = result.tags as Record<string, number | undefined>;
			const latitude = tags["GPSLatitude"];
			const longitude = tags["GPSLongitude"];
			if (typeof latitude !== "number" || typeof longitude !== "number") {
				return null;
			}
			return { latitude, longitude };
		} catch {
			return null;
		}
	}

	private fallbackBbox(
		width: number,
		height: number,
		srid: number,
	): RasterBoundingBox {
		if (srid === 4326) {
			return {
				minX: -0.01,
				minY: -0.01,
				maxX: 0.01,
				maxY: 0.01,
			};
		}
		return {
			minX: 0,
			minY: 0,
			maxX: width,
			maxY: height,
		};
	}

	private toDataUrl(buffer: ArrayBuffer, mime: string): string {
		const bytes = new Uint8Array(buffer);
		let binary = "";
		const chunkSize = 0x8000;
		for (let i = 0; i < bytes.length; i += chunkSize) {
			binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
		}
		return `data:${mime};base64,${btoa(binary)}`;
	}

	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = "";
		const chunkSize = 0x8000;
		for (let i = 0; i < bytes.length; i += chunkSize) {
			binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
		}
		return btoa(binary);
	}
}
