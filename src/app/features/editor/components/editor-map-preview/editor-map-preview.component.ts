import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	type ElementRef,
	effect,
	Injector,
	inject,
	input,
	type OnDestroy,
	signal,
	viewChild,
} from "@angular/core";
import type { MapRasterOverlay } from "@app/core/services/raster/raster.types";
import { HlmButtonImports } from "@app/shared/ui/button";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import * as maplibregl from "maplibre-gl";

type MapViewMode = "2d" | "3d" | "auto";

@Component({
	selector: "app-editor-map-preview",
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [HlmButtonImports],
	styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 400px;
    }
    .map-shell {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 400px;
    }
    .map-container {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 400px;
    }
    .view-toggle {
      position: absolute;
      top: 0.5rem;
      left: 0.5rem;
      z-index: 2;
      display: inline-flex;
      gap: 0.25rem;
      padding: 0.25rem;
      border-radius: 0.375rem;
      border: 1px solid var(--border);
      background: color-mix(in oklch, var(--background) 92%, transparent);
      backdrop-filter: blur(4px);
    }
  `,
	template: `
    <div class="map-shell">
      <div class="view-toggle">
        <button
          hlmBtn
          size="sm"
          type="button"
          [variant]="viewMode() === '2d' ? 'default' : 'ghost'"
          class="h-7 px-2 text-xs"
          (click)="setViewMode('2d')"
        >
          2D
        </button>
        <button
          hlmBtn
          size="sm"
          type="button"
          [variant]="viewMode() === '3d' ? 'default' : 'ghost'"
          class="h-7 px-2 text-xs"
          (click)="setViewMode('3d')"
        >
          3D
        </button>
        <button
          hlmBtn
          size="sm"
          type="button"
          [variant]="viewMode() === 'auto' ? 'default' : 'ghost'"
          class="h-7 px-2 text-xs"
          (click)="setViewMode('auto')"
        >
          Auto
        </button>
      </div>
      <div #mapContainer class="map-container"></div>
    </div>
  `,
})
export class EditorMapPreviewComponent implements OnDestroy {
	private readonly injector = inject(Injector);

	readonly collection = input<FeatureCollection | null>(null);
	readonly rasterOverlay = input<MapRasterOverlay | null>(null);
	readonly srid = input(4326);

	private readonly mapContainer =
		viewChild<ElementRef<HTMLDivElement>>("mapContainer");
	private map: maplibregl.Map | null = null;
	private mapReady = false;
	private lastCollection: FeatureCollection | null = null;
	private lastRasterOverlay: MapRasterOverlay | null = null;

	readonly viewMode = signal<MapViewMode>("auto");

	constructor() {
		afterNextRender(
			() => {
				this.initMap();
			},
			{ injector: this.injector },
		);

		effect(() => {
			const data = this.collection();
			this.lastCollection = data;
			if (this.mapReady) {
				this.updateData(data, this.lastRasterOverlay);
			}
		});

		effect(() => {
			const overlay = this.rasterOverlay();
			this.lastRasterOverlay = overlay;
			if (this.mapReady) {
				this.updateData(this.lastCollection, overlay);
			}
		});

		effect(() => {
			this.viewMode();
			if (this.mapReady) {
				this.updateData(this.lastCollection, this.lastRasterOverlay);
			}
		});
	}

	ngOnDestroy(): void {
		this.map?.remove();
		this.map = null;
		this.mapReady = false;
	}

	setViewMode(mode: MapViewMode): void {
		this.viewMode.set(mode);
	}

	private initMap(): void {
		const container = this.mapContainer()?.nativeElement;
		if (!container || this.map) {
			return;
		}

		this.map = new maplibregl.Map({
			container,
			style: {
				version: 8,
				sources: {
					osm: {
						type: "raster",
						tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
						tileSize: 256,
						attribution: "© OpenStreetMap",
					},
				},
				layers: [{ id: "osm", type: "raster", source: "osm" }],
			},
			center: [2.35, 48.85],
			zoom: 5,
			pitch: 0,
			bearing: 0,
		});

		this.map.addControl(
			new maplibregl.NavigationControl({ showCompass: true }),
			"top-right",
		);

		this.map.once("load", () => {
			this.mapReady = true;
			queueMicrotask(() => this.map?.resize());
			setTimeout(() => this.map?.resize(), 0);
			setTimeout(() => this.map?.resize(), 150);
			this.updateData(this.collection(), this.rasterOverlay());
		});
	}

	private has3dData(data: FeatureCollection): boolean {
		return data.features.some(
			(feature) =>
				feature.properties?.["_has_z"] === true ||
				typeof feature.properties?.["_extrusion_height"] === "number",
		);
	}

	private shouldRender3d(data: FeatureCollection): boolean {
		const mode = this.viewMode();
		if (mode === "2d") {
			return false;
		}
		if (mode === "3d") {
			return true;
		}
		return this.has3dData(data);
	}

	private updateData(
		data: FeatureCollection | null,
		rasterOverlay: MapRasterOverlay | null,
	): void {
		if (!this.map || !this.mapReady) {
			return;
		}

		const sourceId = "etl-preview";
		const layerId = "etl-preview-layer";
		const outlineId = "etl-preview-outline";
		const pointLayerId = "etl-preview-points";
		const extrusionId = "etl-preview-extrusion";
		const rasterSourceId = "etl-raster-overlay";
		const rasterLayerId = "etl-raster-overlay-layer";

		for (const layer of [
			extrusionId,
			pointLayerId,
			outlineId,
			layerId,
			rasterLayerId,
		]) {
			if (this.map.getLayer(layer)) {
				this.map.removeLayer(layer);
			}
		}
		for (const source of [sourceId, rasterSourceId]) {
			if (this.map.getSource(source)) {
				this.map.removeSource(source);
			}
		}

		const bounds = new maplibregl.LngLatBounds();
		let hasBounds = false;

		if (rasterOverlay) {
			this.map.addSource(rasterSourceId, {
				type: "image",
				url: rasterOverlay.url,
				coordinates: rasterOverlay.coordinates,
			});
			this.map.addLayer({
				id: rasterLayerId,
				type: "raster",
				source: rasterSourceId,
				paint: { "raster-opacity": 0.92 },
			});
			for (const coordinate of rasterOverlay.coordinates) {
				bounds.extend(coordinate);
				hasBounds = true;
			}
		}

		if (!data || data.features.length === 0) {
			this.map.setPitch(0);
			if (hasBounds && !bounds.isEmpty()) {
				this.map.fitBounds(bounds, { padding: 48, maxZoom: 18 });
			}
			queueMicrotask(() => this.map?.resize());
			return;
		}

		const enriched: FeatureCollection = {
			type: "FeatureCollection",
			features: data.features.map((feature) =>
				this.ensureExtrusionProperties(feature),
			),
		};

		const is3d = this.shouldRender3d(enriched);
		this.map.setPitch(is3d ? 55 : 0);

		this.map.addSource(sourceId, { type: "geojson", data: enriched });

		if (is3d) {
			this.map.addLayer({
				id: extrusionId,
				type: "fill-extrusion",
				source: sourceId,
				paint: {
					"fill-extrusion-color": "#3b82f6",
					"fill-extrusion-height": [
						"coalesce",
						["get", "_extrusion_height"],
						10,
					],
					"fill-extrusion-base": ["coalesce", ["get", "_elevation"], 0],
					"fill-extrusion-opacity": 0.85,
				},
				filter: ["==", "$type", "Polygon"],
			});
		} else {
			this.map.addLayer({
				id: layerId,
				type: "fill",
				source: sourceId,
				paint: { "fill-color": "#3b82f6", "fill-opacity": 0.35 },
				filter: ["==", "$type", "Polygon"],
			});
		}

		this.map.addLayer({
			id: outlineId,
			type: "line",
			source: sourceId,
			paint: { "line-color": "#1d4ed8", "line-width": 2 },
		});
		this.map.addLayer({
			id: pointLayerId,
			type: "circle",
			source: sourceId,
			paint: { "circle-radius": 6, "circle-color": "#2563eb" },
			filter: ["==", "$type", "Point"],
		});

		for (const feature of enriched.features) {
			this.extendBounds(bounds, feature.geometry);
			hasBounds = true;
		}
		if (hasBounds && !bounds.isEmpty()) {
			this.map.fitBounds(bounds, {
				padding: 48,
				maxZoom: is3d ? 18 : rasterOverlay ? 18 : 14,
			});
		}

		queueMicrotask(() => this.map?.resize());
	}

	private ensureExtrusionProperties(feature: Feature): Feature {
		const height = feature.properties?.["_extrusion_height"];
		if (typeof height === "number") {
			return feature;
		}

		const z = this.maxZ(feature.geometry);
		if (z <= 0) {
			return feature;
		}

		return {
			...feature,
			properties: {
				...feature.properties,
				_elevation: 0,
				_extrusion_height: z,
				_has_z: true,
			},
		};
	}

	private maxZ(geometry: Geometry | null | undefined): number {
		if (!geometry) {
			return 0;
		}

		let maxZ = 0;
		const walk = (coords: number[] | number[][] | number[][][]) => {
			if (typeof coords[0] === "number") {
				const point = coords as number[];
				maxZ = Math.max(maxZ, point[2] ?? 0);
				return;
			}
			for (const child of coords) {
				walk(child as number[] | number[][] | number[][][]);
			}
		};

		if (geometry.type !== "GeometryCollection") {
			walk(geometry.coordinates as number[] | number[][] | number[][][]);
		}

		return maxZ;
	}

	private extendBounds(
		bounds: maplibregl.LngLatBounds,
		geometry: Geometry | null | undefined,
	): void {
		if (!geometry) {
			return;
		}

		const walk = (coords: number[] | number[][] | number[][][]) => {
			if (typeof coords[0] === "number") {
				bounds.extend([coords[0] as number, coords[1] as number]);
				return;
			}
			for (const child of coords) {
				walk(child as number[] | number[][] | number[][][]);
			}
		};

		if (geometry.type === "GeometryCollection") {
			for (const part of geometry.geometries) {
				this.extendBounds(bounds, part);
			}
			return;
		}

		walk(geometry.coordinates as number[] | number[][] | number[][][]);
	}
}
