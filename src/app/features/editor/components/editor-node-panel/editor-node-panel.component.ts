import {
	ChangeDetectionStrategy,
	Component,
	effect,
	input,
	output,
	signal,
} from "@angular/core";
import type { MapRasterOverlay } from "@app/core/services/raster/raster.types";
import { HlmButtonImports } from "@app/shared/ui/button";
import {
	LucideBot,
	LucideListTree,
	LucideMap,
	LucideSettings,
	LucideTable,
} from "@lucide/angular";
import type { FeatureCollection } from "geojson";
import type { EtlPipelineNode } from "../../../copilot/copilot.types";
import type { NodeAttribute } from "../../services/editor-canvas.utils";
import { mergeNodeConfig } from "../../services/editor-node-config.utils";
import { EditorMapPreviewComponent } from "../editor-map-preview/editor-map-preview.component";
import { EditorFormatAttributesTableComponent } from "./editor-format-attributes-table.component";
import { EditorNodeAttributesTableComponent } from "./editor-node-attributes-table.component";
import { EditorNodeParamsComponent } from "./editor-node-params.component";

type InspectorTab = "params" | "attributes" | "formatAttributes" | "map";

@Component({
	selector: "app-editor-node-panel",
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		LucideBot,
		LucideSettings,
		LucideTable,
		LucideListTree,
		LucideMap,
		HlmButtonImports,
		EditorMapPreviewComponent,
		EditorNodeParamsComponent,
		EditorNodeAttributesTableComponent,
		EditorFormatAttributesTableComponent,
	],
	template: `
    @if (node(); as selected) {
      <div class="flex h-full flex-col gap-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold">{{ selected.label }}</h3>
            <p class="text-xs text-muted-foreground font-mono">{{ selected.type }}</p>
          </div>
          <button hlmBtn variant="outline" size="sm" type="button" (click)="askAssistant.emit()">
            <svg lucideBot class="size-4"></svg>
            Expliquer
          </button>
        </div>

        <div class="inline-flex rounded-md border p-0.5 bg-muted/30">
          <button
            hlmBtn
            size="sm"
            type="button"
            [variant]="activeTab() === 'params' ? 'default' : 'ghost'"
            class="h-7 text-xs gap-1"
            (click)="activeTab.set('params')"
          >
            <svg lucideSettings class="size-3.5"></svg>
            Paramètres
          </button>
          <button
            hlmBtn
            size="sm"
            type="button"
            [variant]="activeTab() === 'attributes' ? 'default' : 'ghost'"
            class="h-7 text-xs gap-1"
            (click)="activeTab.set('attributes')"
          >
            <svg lucideTable class="size-3.5"></svg>
            Attributs utilisateur
          </button>
          @if (isIoNode(selected)) {
            <button
              hlmBtn
              size="sm"
              type="button"
              [variant]="activeTab() === 'formatAttributes' ? 'default' : 'ghost'"
              class="h-7 text-xs gap-1"
              (click)="activeTab.set('formatAttributes')"
            >
              <svg lucideListTree class="size-3.5"></svg>
              Format Attributes
            </button>
          }
          <button
            hlmBtn
            size="sm"
            type="button"
            [variant]="activeTab() === 'map' ? 'default' : 'ghost'"
            class="h-7 text-xs gap-1"
            (click)="activeTab.set('map')"
          >
            <svg lucideMap class="size-3.5"></svg>
            Carte 2D/3D
          </button>
        </div>

        @if (assistantReply()) {
          <div class="rounded-md border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
            {{ assistantReply() }}
          </div>
        }

        @if (activeTab() === 'params') {
          <app-editor-node-params
            [node]="selected"
            (configPatch)="onConfigPatch($event)"
            (fileSelected)="onFileSelected($event)"
          />
        }

        @if (activeTab() === 'attributes') {
          <app-editor-node-attributes-table
            class="flex flex-1 min-h-0"
            [node]="selected"
            (configPatch)="onConfigPatch($event)"
          />
        }

        @if (activeTab() === 'formatAttributes' && isIoNode(selected)) {
          <app-editor-format-attributes-table
            class="flex flex-1 min-h-0"
            [node]="selected"
            (configPatch)="onConfigPatch($event)"
          />
        }

        @if (activeTab() === 'map') {
          <div class="rounded-md border overflow-hidden flex-1 min-h-[280px]">
            <app-editor-map-preview
              [collection]="preview()"
              [rasterOverlay]="rasterOverlay()"
              [srid]="srid()"
            />
          </div>
        }
      </div>
    } @else {
      <p class="text-sm text-muted-foreground">Sélectionnez un nœud pour ouvrir l'inspecteur.</p>
    }
  `,
})
export class EditorNodePanelComponent {
	readonly node = input<EtlPipelineNode | null>(null);
	readonly preview = input<FeatureCollection | null>(null);
	readonly rasterOverlay = input<MapRasterOverlay | null>(null);
	readonly attributes = input<NodeAttribute[]>([]);
	readonly srid = input(4326);
	readonly assistantReply = input<string | null>(null);
	readonly focusParamsToken = input(0);

	readonly configChange = output<{
		nodeId: string;
		config: Record<string, unknown>;
	}>();
	readonly fileImport = output<{ nodeId: string; file: File }>();
	readonly askAssistant = output<void>();

	readonly activeTab = signal<InspectorTab>("params");

	constructor() {
		effect(() => {
			if (this.focusParamsToken() > 0) {
				this.activeTab.set("params");
			}
		});
	}

	onConfigPatch(patch: Record<string, unknown>): void {
		const node = this.node();
		if (!node) {
			return;
		}
		this.configChange.emit({
			nodeId: node.id,
			config: mergeNodeConfig(node, patch),
		});
	}

	onFileSelected(event: Event): void {
		const node = this.node();
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!node || !file) {
			return;
		}
		this.fileImport.emit({ nodeId: node.id, file });
		input.value = "";
	}

	focusParams(): void {
		this.activeTab.set("params");
	}

	isIoNode(node: EtlPipelineNode): boolean {
		return node.type === "reader" || node.type === "writer";
	}
}
