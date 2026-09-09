export const SMART_DROP_EXTENSIONS = new Set([
	"xlsx",
	"csv",
	"gpkg",
	"shp",
	"zip",
	"geojson",
	"json",
	"tif",
	"tiff",
	"jpg",
	"jpeg",
	"png",
	"parquet",
]);

export const PROJECT_DROP_EXTENSIONS = new Set(["fmw", "model3"]);

export function fileExtension(fileName: string): string {
	return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isProjectDropFile(file: File): boolean {
	const extension = fileExtension(file.name);
	return (
		PROJECT_DROP_EXTENSIONS.has(extension) ||
		(extension === "json" && !isLikelyGeoJsonName(file.name))
	);
}

function isLikelyGeoJsonName(fileName: string): boolean {
	const lower = fileName.toLowerCase();
	return lower.includes("geojson") || lower.endsWith(".geojson");
}

export function isSmartDataDropFile(file: File): boolean {
	const extension = fileExtension(file.name);
	if (PROJECT_DROP_EXTENSIONS.has(extension)) {
		return false;
	}
	if (extension === "json") {
		return true;
	}
	return SMART_DROP_EXTENSIONS.has(extension);
}

export function isSupportedDropFile(file: File): boolean {
	return isSmartDataDropFile(file) || isProjectDropFile(file);
}
