import { Injectable } from "@angular/core";
import JSZip from "jszip";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "tif", "tiff"]);
const WORLD_FILE_EXTENSIONS = new Set([
	"jgw",
	"jwx",
	"pgw",
	"tfw",
	"wld",
	"bpw",
	"gfw",
]);

export type ZipArchiveKind = "raster" | "shapefile" | "unknown";

export interface ZipArchiveEntry {
	path: string;
	name: string;
	extension: string;
	data: ArrayBuffer;
}

export interface ZipRasterBundle {
	image: ZipArchiveEntry;
	worldFile?: ZipArchiveEntry;
	prjFile?: ZipArchiveEntry;
}

export interface ZipExtractionResult {
	kind: ZipArchiveKind;
	archiveName: string;
	entries: ZipArchiveEntry[];
	raster?: ZipRasterBundle;
	shapefileBaseName?: string;
	rawZipBuffer: ArrayBuffer;
}

@Injectable({ providedIn: "root" })
export class ZipExtractorService {
	async extractFromFile(file: File): Promise<ZipExtractionResult> {
		const buffer = await file.arrayBuffer();
		return this.extractFromBuffer(buffer, file.name);
	}

	async extractFromBuffer(
		buffer: ArrayBuffer,
		archiveName = "archive.zip",
	): Promise<ZipExtractionResult> {
		const zip = await JSZip.loadAsync(buffer);
		const entries: ZipArchiveEntry[] = [];

		await Promise.all(
			Object.keys(zip.files).map(async (path) => {
				const entry = zip.files[path];
				if (!entry || entry.dir) {
					return;
				}
				const name = path.split("/").pop() ?? path;
				const extension = name.split(".").pop()?.toLowerCase() ?? "";
				const data = await entry.async("arraybuffer");
				entries.push({ path, name, extension, data });
			}),
		);

		const hasShapefile = entries.some((entry) => entry.extension === "shp");
		if (hasShapefile) {
			const shp = entries.find((entry) => entry.extension === "shp");
			return {
				kind: "shapefile",
				archiveName,
				entries,
				shapefileBaseName: shp?.name.replace(/\.shp$/i, ""),
				rawZipBuffer: buffer,
			};
		}

		const images = entries.filter((entry) =>
			IMAGE_EXTENSIONS.has(entry.extension),
		);
		if (images.length > 0) {
			const image = this.pickPrimaryImage(images);
			const baseName = image.name.replace(/\.[^.]+$/i, "");
			const worldFile = this.findCompanion(
				entries,
				baseName,
				WORLD_FILE_EXTENSIONS,
			);
			const prjFile = entries.find(
				(entry) => entry.extension === "prj" && entry.name.startsWith(baseName),
			);

			return {
				kind: "raster",
				archiveName,
				entries,
				raster: {
					image,
					worldFile,
					prjFile,
				},
				rawZipBuffer: buffer,
			};
		}

		return {
			kind: "unknown",
			archiveName,
			entries,
			rawZipBuffer: buffer,
		};
	}

	private pickPrimaryImage(images: ZipArchiveEntry[]): ZipArchiveEntry {
		return [...images].sort(
			(left, right) => right.data.byteLength - left.data.byteLength,
		)[0];
	}

	private findCompanion(
		entries: ZipArchiveEntry[],
		baseName: string,
		extensions: Set<string>,
	): ZipArchiveEntry | undefined {
		const normalized = baseName.toLowerCase();
		return entries.find(
			(entry) =>
				extensions.has(entry.extension) &&
				entry.name.replace(/\.[^.]+$/i, "").toLowerCase() === normalized,
		);
	}
}
