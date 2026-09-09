import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideBot } from '@lucide/angular';
import { HlmButtonImports } from '@app/shared/ui/button';
import { FormsModule } from '@angular/forms';
import type { FeatureCollection } from 'geojson';
import type { EtlPipelineNode } from '../../../copilot/copilot.types';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmLabelImports } from '@app/shared/ui/label';
import { EditorMapPreviewComponent } from '../editor-map-preview/editor-map-preview.component';

@Component({
  selector: 'app-editor-node-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideBot, HlmButtonImports, HlmInputImports, HlmLabelImports, EditorMapPreviewComponent],
  template: `
    @if (node(); as selected) {
      <div class="space-y-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold">{{ selected.label }}</h3>
            <p class="text-xs text-muted-foreground">{{ selected.type }}</p>
          </div>
          <button hlmBtn variant="outline" size="sm" type="button" (click)="askAssistant.emit()">
            <svg lucideBot class="size-4"></svg>
            Expliquer ce nœud
          </button>
        </div>

        @if (assistantReply()) {
          <div class="rounded-md border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
            {{ assistantReply() }}
          </div>
        }

        @if (selected.type === 'reader') {
          <div class="space-y-2">
            <label hlmLabel class="text-xs">Format</label>
            <p class="text-sm">{{ selected.config['format'] ?? 'geojson' }}</p>
          </div>
          @if (selected.config['format'] === 'geojson' || !selected.config['format']) {
            <div class="space-y-1">
              <label hlmLabel for="geojson-text" class="text-xs">GeoJSON inline</label>
              <textarea
                id="geojson-text"
                class="border-input bg-background min-h-[6rem] w-full rounded-md border px-3 py-2 text-xs font-mono"
                [ngModel]="geoJsonText()"
                (ngModelChange)="onGeoJsonChange($event)"
                name="geoJsonText"
              ></textarea>
            </div>
          }
          @if (selected.config['format'] === 'csv') {
            <div class="space-y-1">
              <label hlmLabel for="csv-text" class="text-xs">Contenu CSV</label>
              <textarea
                id="csv-text"
                class="border-input bg-background min-h-[6rem] w-full rounded-md border px-3 py-2 text-xs font-mono"
                [ngModel]="csvText()"
                (ngModelChange)="onCsvChange($event)"
                name="csvText"
              ></textarea>
            </div>
          }
          <div class="space-y-1">
            <label hlmLabel for="file-import" class="text-xs">Importer un fichier</label>
            <input
              id="file-import"
              type="file"
              class="text-xs w-full"
              (change)="onFileSelected($event)"
            />
          </div>
        }

        @if (selected.type === 'buffer') {
          <div class="space-y-1">
            <label hlmLabel for="buffer-distance" class="text-xs">Distance (m)</label>
            <input
              hlmInput
              id="buffer-distance"
              type="number"
              class="w-full"
              [ngModel]="selected.config['distance_m']"
              (ngModelChange)="patchConfig('distance_m', $event)"
              name="distanceM"
            />
          </div>
        }

        @if (selected.type === 'reproject') {
          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1">
              <label hlmLabel for="source-srid" class="text-xs">Source EPSG</label>
              <input
                hlmInput
                id="source-srid"
                type="number"
                class="w-full"
                [ngModel]="selected.config['source_srid']"
                (ngModelChange)="patchConfig('source_srid', $event)"
                name="sourceSrid"
              />
            </div>
            <div class="space-y-1">
              <label hlmLabel for="target-srid" class="text-xs">Cible EPSG</label>
              <input
                hlmInput
                id="target-srid"
                type="number"
                class="w-full"
                [ngModel]="selected.config['target_srid']"
                (ngModelChange)="patchConfig('target_srid', $event)"
                name="targetSrid"
              />
            </div>
          </div>
        }

        @if (selected.type === 'topology_validator') {
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              class="accent-primary"
              [checked]="selected.config['heal'] !== false"
              (change)="patchConfig('heal', $any($event.target).checked)"
            />
            Réparer automatiquement
          </label>
        }

        <div class="space-y-1">
          <p class="text-xs font-medium">Configuration JSON</p>
          <pre class="text-[10px] bg-muted rounded-md p-2 overflow-auto max-h-32">{{ configPreview(selected) }}</pre>
        </div>

        <div class="space-y-1">
          <p class="text-xs font-medium">Prévisualisation cartographique</p>
          <div class="rounded-md border overflow-hidden" style="height: 400px; min-height: 400px; width: 100%;">
            <app-editor-map-preview [collection]="preview()" [srid]="srid()" />
          </div>
        </div>
      </div>
    } @else {
      <p class="text-sm text-muted-foreground">Sélectionnez un nœud pour voir ses attributs.</p>
    }
  `,
})
export class EditorNodePanelComponent {
  readonly node = input<EtlPipelineNode | null>(null);
  readonly preview = input<FeatureCollection | null>(null);
  readonly srid = input(4326);
  readonly assistantReply = input<string | null>(null);

  readonly configChange = output<{ nodeId: string; config: Record<string, unknown> }>();
  readonly fileImport = output<{ nodeId: string; file: File }>();
  readonly askAssistant = output<void>();

  geoJsonText(): string {
    const inline = this.node()?.config['inline'];
    if (!inline) {
      return '';
    }
    return JSON.stringify(inline, null, 2);
  }

  csvText(): string {
    return String(this.node()?.config['text'] ?? '');
  }

  configPreview(node: EtlPipelineNode): string {
    return JSON.stringify(node.config, null, 2);
  }

  onGeoJsonChange(text: string): void {
    const node = this.node();
    if (!node) {
      return;
    }
    try {
      const inline = JSON.parse(text);
      this.configChange.emit({ nodeId: node.id, config: { ...node.config, inline, format: 'geojson' } });
    } catch {
      this.configChange.emit({ nodeId: node.id, config: { ...node.config, text, format: 'geojson' } });
    }
  }

  onCsvChange(text: string): void {
    const node = this.node();
    if (!node) {
      return;
    }
    this.configChange.emit({ nodeId: node.id, config: { ...node.config, text, format: 'csv' } });
  }

  patchConfig(key: string, value: unknown): void {
    const node = this.node();
    if (!node) {
      return;
    }
    this.configChange.emit({ nodeId: node.id, config: { ...node.config, [key]: value } });
  }

  onFileSelected(event: Event): void {
    const node = this.node();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!node || !file) {
      return;
    }
    this.fileImport.emit({ nodeId: node.id, file });
    input.value = '';
  }
}
