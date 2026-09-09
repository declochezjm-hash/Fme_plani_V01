import { fileExtension } from "@app/core/services/copilot/smart-file-drop.utils";

const IN_MEMORY_GEO_EXTENSIONS = new Set(["zip", "shp", "gpkg"]);

export function needsInMemoryGeoRead(file: File): boolean {
	return IN_MEMORY_GEO_EXTENSIONS.has(fileExtension(file.name));
}

export function isZipOrShapeDrop(file: File): boolean {
	const extension = fileExtension(file.name);
	return extension === "zip" || extension === "shp" || extension === "gpkg";
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (reader.result instanceof ArrayBuffer) {
				resolve(reader.result);
				return;
			}
			reject(new Error("Lecture du fichier en mémoire impossible."));
		};
		reader.onerror = () => {
			reject(
				reader.error ??
					new Error("Erreur FileReader lors de la lecture du fichier."),
			);
		};
		reader.readAsArrayBuffer(file);
	});
}

export function dragEventHasFiles(event: DragEvent): boolean {
	return !!event.dataTransfer?.types.includes("Files");
}

export function firstDroppedFile(event: DragEvent): File | null {
	return event.dataTransfer?.files?.[0] ?? null;
}
