import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucidePlus, LucideTrash2 } from '@lucide/angular';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmLabelImports } from '@app/shared/ui/label';
import type { EtlPipelineNode } from '../../../copilot/copilot.types';
import {
  BUFFER_UNIT_OPTIONS,
  EPSG_SUGGESTIONS,
  FEATURE_OPERATION_OPTIONS,
  FILTER_OPERATOR_OPTIONS,
  IO_FORMAT_OPTIONS,
  TABLE_HANDLING_OPTIONS,
  type FilterCondition,
} from '../../services/editor-node-config.types';
import { createDefaultFilterCondition } from '../../services/editor-node-config.utils';
import { EditorFormatParamsDialogComponent } from './editor-format-params-dialog.component';
import { EditorVariableInputComponent } from './editor-variable-input.component';

@Component({
  selector: 'app-editor-node-params',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucidePlus,
    LucideTrash2,
    HlmButtonImports,
    HlmInputImports,
    HlmLabelImports,
    EditorVariableInputComponent,
    EditorFormatParamsDialogComponent,
  ],
  template: `
    <div class="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
      @if (node().type === 'reader' || node().type === 'writer') {
        <section class="space-y-3 rounded-md border bg-muted/20 p-3">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {{ node().type === 'writer' ? 'FeatureWriter' : 'FeatureReader' }}
          </p>

          <div class="space-y-1">
            <label hlmLabel class="text-xs">Format</label>
            <select
              class="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
              [ngModel]="node().config['format'] ?? 'geojson'"
              (ngModelChange)="patch({ format: $event })"
              name="ioFormat"
            >
              @for (option of formatOptions; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>

          <div class="flex items-end justify-between gap-2">
            <p class="text-xs text-muted-foreground">Parameters</p>
            @if (isPostgisFormat()) {
              <button
                hlmBtn
                variant="outline"
                size="sm"
                type="button"
                class="h-7 text-xs"
                (click)="openFormatParams()"
              >
                Parameters...
              </button>
            }
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1">
              <label hlmLabel class="text-xs">Table Name</label>
              <app-editor-variable-input
                [value]="configString('tableName')"
                name="tableName"
                (valueChange)="patch({ tableName: $event })"
              />
            </div>
            <div class="space-y-1">
              <label hlmLabel class="text-xs">Table Qualifier / Schema</label>
              <app-editor-variable-input
                [value]="configString('schema', 'public')"
                name="schema"
                (valueChange)="patch({ schema: $event })"
              />
            </div>
          </div>

          @if (node().type === 'writer') {
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <label hlmLabel class="text-xs">Feature Operation</label>
                <select
                  class="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
                  [ngModel]="node().config['featureOperation'] ?? 'insert'"
                  (ngModelChange)="patch({ featureOperation: $event })"
                  name="featureOperation"
                >
                  @for (option of featureOperationOptions; track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
              </div>
              <div class="space-y-1">
                <label hlmLabel class="text-xs">Table Handling</label>
                <select
                  class="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
                  [ngModel]="node().config['tableHandling'] ?? 'use_existing'"
                  (ngModelChange)="patch({ tableHandling: $event })"
                  name="tableHandling"
                >
                  @for (option of tableHandlingOptions; track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
              </div>
            </div>
          }

          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1">
              <label hlmLabel class="text-xs">Source Coord. System (EPSG)</label>
              <input
                hlmInput
                class="w-full text-xs font-mono"
                list="epsg-source-list"
                type="number"
                [ngModel]="node().config['sourceSrid'] ?? node().config['source_srid'] ?? 4326"
                (ngModelChange)="patch({ sourceSrid: +$event, source_srid: +$event })"
                name="sourceSrid"
              />
            </div>
            <div class="space-y-1">
              <label hlmLabel class="text-xs">Destination Coord. System (EPSG)</label>
              <input
                hlmInput
                class="w-full text-xs font-mono"
                list="epsg-target-list"
                type="number"
                [ngModel]="node().config['targetSrid'] ?? node().config['target_srid'] ?? 4326"
                (ngModelChange)="patch({ targetSrid: +$event, target_srid: +$event })"
                name="targetSrid"
              />
            </div>
          </div>

          @if (node().type === 'reader') {
            <div class="space-y-1">
              <label hlmLabel for="file-import" class="text-xs">Importer un fichier</label>
              <input id="file-import" type="file" class="text-xs w-full" (change)="fileSelected.emit($event)" />
            </div>
          }
        </section>
      }

      @if (node().type === 'reproject') {
        <section class="space-y-3 rounded-md border bg-muted/20 p-3">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reprojector</p>
          <div class="grid grid-cols-1 gap-2">
            <div class="space-y-1">
              <label hlmLabel class="text-xs">Source Coord. System</label>
              <input
                hlmInput
                class="w-full text-xs font-mono"
                list="epsg-source-list"
                type="number"
                [ngModel]="node().config['source_srid'] ?? 4326"
                (ngModelChange)="patch({ source_srid: +$event, sourceSrid: +$event })"
                name="reprojectSource"
              />
            </div>
            <div class="space-y-1">
              <label hlmLabel class="text-xs">Destination Coord. System</label>
              <input
                hlmInput
                class="w-full text-xs font-mono"
                list="epsg-target-list"
                type="number"
                [ngModel]="node().config['target_srid'] ?? 2154"
                (ngModelChange)="patch({ target_srid: +$event, targetSrid: +$event })"
                name="reprojectTarget"
              />
            </div>
          </div>
        </section>
      }

      @if (node().type === 'buffer') {
        <section class="space-y-3 rounded-md border bg-muted/20 p-3">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bufferer</p>
          <div class="grid grid-cols-[1fr_auto] gap-2">
            <div class="space-y-1">
              <label hlmLabel class="text-xs">Buffer Distance</label>
              <input
                hlmInput
                type="number"
                class="w-full text-xs"
                [ngModel]="node().config['distance'] ?? node().config['distance_m'] ?? 50"
                (ngModelChange)="patch({ distance: +$event })"
                name="bufferDistance"
              />
            </div>
            <div class="space-y-1">
              <label hlmLabel class="text-xs">Unit</label>
              <select
                class="border-input bg-background h-8 w-full min-w-[7rem] rounded-md border px-2 text-xs"
                [ngModel]="node().config['unit'] ?? 'meters'"
                (ngModelChange)="patch({ unit: $event })"
                name="bufferUnit"
              >
                @for (option of bufferUnitOptions; track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
            </div>
          </div>
          <label class="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              class="accent-primary"
              [checked]="node().config['dissolve'] === true"
              (change)="patch({ dissolve: $any($event.target).checked })"
            />
            Dissolve buffer results
          </label>
        </section>
      }

      @if (node().type === 'tester' || node().type === 'topology_validator') {
        <section class="space-y-3 rounded-md border bg-muted/20 p-3">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tester</p>
          @for (condition of conditions(); track $index) {
            <div class="grid grid-cols-[1fr_auto_auto_1fr_auto] gap-1 items-end">
              <div class="space-y-1">
                <label hlmLabel class="text-[10px]">Attribute</label>
                <input
                  hlmInput
                  class="text-xs"
                  [ngModel]="condition.attribute"
                  (ngModelChange)="updateCondition($index, { attribute: $event })"
                  [name]="'attr-' + $index"
                />
              </div>
              <div class="space-y-1">
                <label hlmLabel class="text-[10px]">Operator</label>
                <select
                  class="border-input bg-background h-8 rounded-md border px-1 text-xs"
                  [ngModel]="condition.operator"
                  (ngModelChange)="updateCondition($index, { operator: $event })"
                  [name]="'op-' + $index"
                >
                  @for (option of filterOperatorOptions; track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
              </div>
              <div class="space-y-1 col-span-2">
                <label hlmLabel class="text-[10px]">Value</label>
                <input
                  hlmInput
                  class="text-xs"
                  [disabled]="condition.operator === 'is_not_null'"
                  [ngModel]="condition.value"
                  (ngModelChange)="updateCondition($index, { value: $event })"
                  [name]="'val-' + $index"
                />
              </div>
              <button
                hlmBtn
                variant="ghost"
                size="icon"
                type="button"
                class="size-8"
                (click)="removeCondition($index)"
              >
                <svg lucideTrash2 class="size-3.5"></svg>
              </button>
            </div>
          }
          <button hlmBtn variant="outline" size="sm" type="button" class="h-7 text-xs" (click)="addCondition()">
            <svg lucidePlus class="size-3.5"></svg>
            Ajouter une condition
          </button>
        </section>
      }

      @if (node().type === 'topology_validator') {
        <label class="flex items-center gap-2 text-xs px-1">
          <input
            type="checkbox"
            class="accent-primary"
            [checked]="node().config['heal'] !== false"
            (change)="patch({ heal: $any($event.target).checked })"
          />
          Réparer automatiquement la géométrie
        </label>
      }

      <datalist id="epsg-source-list">
        @for (epsg of epsgSuggestions; track epsg.code) {
          <option [value]="epsg.code">{{ epsg.code }} — {{ epsg.label }}</option>
        }
      </datalist>
      <datalist id="epsg-target-list">
        @for (epsg of epsgSuggestions; track epsg.code) {
          <option [value]="epsg.code">{{ epsg.code }} — {{ epsg.label }}</option>
        }
      </datalist>

      <app-editor-format-params-dialog
        [node]="node()"
        [openToken]="formatParamsToken()"
        (saved)="onFormatParamsSaved($event)"
      />
    </div>
  `,
})
export class EditorNodeParamsComponent {
  readonly node = input.required<EtlPipelineNode>();

  readonly configPatch = output<Record<string, unknown>>();
  readonly fileSelected = output<Event>();

  readonly formatParamsToken = signal(0);

  readonly formatOptions = IO_FORMAT_OPTIONS;
  readonly featureOperationOptions = FEATURE_OPERATION_OPTIONS;
  readonly tableHandlingOptions = TABLE_HANDLING_OPTIONS;
  readonly bufferUnitOptions = BUFFER_UNIT_OPTIONS;
  readonly filterOperatorOptions = FILTER_OPERATOR_OPTIONS;
  readonly epsgSuggestions = EPSG_SUGGESTIONS;

  conditions(): FilterCondition[] {
    const stored = this.node().config['conditions'];
    if (Array.isArray(stored) && stored.length > 0) {
      return stored as FilterCondition[];
    }
    return [createDefaultFilterCondition()];
  }

  configString(key: string, fallback = ''): string {
    const value = this.node().config[key];
    return value === undefined || value === null ? fallback : String(value);
  }

  isPostgisFormat(): boolean {
    return (this.node().config['format'] ?? 'geojson') === 'postgis';
  }

  openFormatParams(): void {
    this.formatParamsToken.update((token) => token + 1);
  }

  onFormatParamsSaved(patch: Record<string, unknown>): void {
    this.configPatch.emit(patch);
  }

  patch(partial: Record<string, unknown>): void {
    this.configPatch.emit(partial);
  }

  addCondition(): void {
    this.patch({ conditions: [...this.conditions(), createDefaultFilterCondition()] });
  }

  removeCondition(index: number): void {
    const next = this.conditions().filter((_, itemIndex) => itemIndex !== index);
    this.patch({ conditions: next.length > 0 ? next : [createDefaultFilterCondition()] });
  }

  updateCondition(index: number, partial: Partial<FilterCondition>): void {
    const next = this.conditions().map((condition, itemIndex) =>
      itemIndex === index ? { ...condition, ...partial } : condition,
    );
    this.patch({ conditions: next });
  }
}
