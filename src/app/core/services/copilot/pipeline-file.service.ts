import { Injectable, inject } from "@angular/core";
import type { EtlPipelineJson } from "@app/features/copilot/copilot.types";
import { RasterReaderService } from "../raster/raster-reader.service";
import { ShapefileReaderService } from "../shapefile/shapefile-reader.service";
import { ZipExtractorService } from "../zip/zip-extractor.service";
import { fileExtension, fileToBase64 } from "./pipeline-file.utils";

@Injectable({ providedIn: "root" })
export class PipelineFileService {
	private readonly zipExtractor = inject(ZipExtractorService);
	private readonly rasterReader = inject(RasterReaderService);
	private readonly shapefileReader = inject(ShapefileReaderService);

	async buildReaderConfigFromFile(
		file: File,
	): Promise<Record<string, unknown>> {
		const extension = fileExtension(file.name);

		if (extension === "geojson" || extension === "json") {
			const text = await file.text();
			return {
				format: "geojson",
				inline: JSON.parse(text),
				sourceFileName: file.name,
			};
		}

		if (extension === "csv") {
			const text = await file.text();
			return { format: "csv", text, sourceFileName: file.name };
		}

		if (extension === "zip") {
			return this.buildReaderConfigFromZip(file);
		}

		if (extension === "shp") {
			throw new Error(
				"Shapefile : regroupez les fichiers .shp, .dbf et .shx (et .prj si disponible) dans une archive .zip, puis déposez le .zip.",
			);
		}

		if (extension === "gpkg") {
			return {
				format: "geopackage",
				fileBase64: await fileToBase64(file),
				sourceFileName: file.name,
			};
		}

		if (extension === "ifc") {
			return {
				format: "ifc",
				fileBase64: await fileToBase64(file),
				sourceFileName: file.name,
			};
		}

		if (extension === "xlsx") {
			throw new Error(
				"Excel : exportez le fichier en CSV pour l'import direct, ou utilisez une conversion X/Y.",
			);
		}

		if (["jpg", "jpeg", "png", "tif", "tiff"].includes(extension)) {
			const raster = await this.rasterReader.readFromFile(file);
			return this.rasterReader.toReaderConfig(raster, file.name);
		}

		if (extension === "parquet") {
			return {
				format: "geojson",
				sourceFileName: file.name,
				pendingImport: true,
			};
		}

		throw new Error(`Extension .${extension} non supportée pour l'import.`);
	}

	async enrichPipelineWithFile(
		pipeline: EtlPipelineJson,
		file: File,
	): Promise<EtlPipelineJson> {
		const readerPatch = await this.buildReaderConfigFromFile(file);
		return {
			...pipeline,
			nodes: pipeline.nodes.map((node) =>
				node.type === "reader"
					? { ...node, config: { ...node.config, ...readerPatch } }
					: node,
			),
		};
	}

	private async buildReaderConfigFromZip(
		file: File,
	): Promise<Record<string, unknown>> {
		const extraction = await this.zipExtractor.extractFromFile(file);

		if (extraction.kind === "raster" && extraction.raster) {
			const raster = await this.rasterReader.readFromZipBundle(
				extraction.raster,
			);
			return this.rasterReader.toReaderConfig(
				raster,
				extraction.raster.image.name,
			);
		}

		if (extraction.kind === "shapefile") {
			const result = await this.shapefileReader.readFromZipFile(file);
			return this.shapefileReader.toReaderConfig(result);
		}

		throw new Error(
			"Archive ZIP non reconnue : attendue shapefile (.shp+.dbf+.shx) ou image raster (.jpg/.png/.tif) avec World File.",
		);
	}
}
