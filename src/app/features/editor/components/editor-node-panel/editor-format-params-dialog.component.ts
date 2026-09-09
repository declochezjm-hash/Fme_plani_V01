import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideMinus, LucidePlus } from '@lucide/angular';
import { BrnDialogContent } from '@spartan-ng/brain/dialog';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmDialogImports } from '@app/shared/ui/dialog';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmLabelImports } from '@app/shared/ui/label';
import type { EtlPipelineNode } from '../../../copilot/copilot.types';
import {
  SPATIAL_COLUMN_TYPE_OPTIONS,
  SSL_MODE_OPTIONS,
  type FeatureTypeDef,
  type PostgisConnectionConfig,
  type PostgisTableCreationConfig,
} from '../../services/editor-node-config.types';
import {
  createDefaultFeatureType,
  getFeatureTypes,
  getPostgisConnection,
  getPostgisTableCreation,
} from '../../services/editor-node-config.utils';
import { EditorVariableInputComponent } from './editor-variable-input.component';

@Component({
  selector: 'app-editor-format-params-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucidePlus,
    LucideMinus,
    BrnDialogContent,
    HlmButtonImports,
    HlmDialogImports,
    HlmInputImports,
    HlmLabelImports,
    EditorVariableInputComponent,
  ],
  template: `
    <hlm-dialog [state]="dialogState()" (stateChanged)="onDialogStateChanged($event)">
      <ng-template brnDialogContent>
        <hlm-dialog-content class="max-w-4xl">
          <hlm-dialog-header>
            <h3 hlmDialogTitle>PostGIS / Format Parameters</h3>
            <p hlmDialogDescription class="text-xs">
              Configuration de connexion et création de table pour {{ node().label }}.
            </p>
          </hlm-dialog-header>

          <div class="grid gap-4 py-2" [class]="node().type === 'writer' ? 'md:grid-cols-[12rem_1fr]' : ''">
            @if (node().type === 'writer') {
              <aside class="rounded-md border bg-muted/20 p-2">
                <p class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Feature Types
                </p>
                <div class="max-h-64 space-y-1 overflow-y-auto">
                  @for (featureType of featureTypes(); track featureType.id) {
                    <button
                      type="button"
                      class="w-full rounded px-2 py-1.5 text-left text-xs"
                      [class]="selectedFeatureTypeId() === featureType.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
                      (click)="selectedFeatureTypeId.set(featureType.id)"
                    >
                      {{ featureType.name }}
                    </button>
                  }
                </div>
                <div class="mt-2 flex gap-1">
                  <button hlmBtn variant="outline" size="sm" type="button" class="h-7 px-2" (click)="addFeatureType()">
                    <svg lucidePlus class="size-3.5"></svg>
                  </button>
                  <button
                    hlmBtn
                    variant="outline"
                    size="sm"
                    type="button"
                    class="h-7 px-2"
                    [disabled]="featureTypes().length <= 1"
                    (click)="removeSelectedFeatureType()"
                  >
                    <svg lucideMinus class="size-3.5"></svg>
                  </button>
                </div>
              </aside>
            }

            <div class="space-y-4">
              <section class="space-y-2 rounded-md border p-3">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Database Connection
                </p>
                <div class="grid grid-cols-2 gap-2">
                  <div class="space-y-1">
                    <label hlmLabel class="text-xs">Host</label>
                    <app-editor-variable-input
                      [value]="connection().host"
                      name="pgHost"
                      (valueChange)="patchConnection({ host: $event })"
                    />
                  </div>
                  <div class="space-y-1">
                    <label hlmLabel class="text-xs">Port</label>
                    <input
                      hlmInput
                      type="number"
                      class="text-xs"
                      [ngModel]="connection().port"
                      (ngModelChange)="patchConnection({ port: +$event })"
                      name="pgPort"
                    />
                  </div>
                  <div class="space-y-1">
                    <label hlmLabel class="text-xs">Database</label>
                    <app-editor-variable-input
                      [value]="connection().database"
                      name="pgDatabase"
                      (valueChange)="patchConnection({ database: $event })"
                    />
                  </div>
                  <div class="space-y-1">
                    <label hlmLabel class="text-xs">Username</label>
                    <app-editor-variable-input
                      [value]="connection().username"
                      name="pgUser"
                      (valueChange)="patchConnection({ username: $event })"
                    />
                  </div>
                  <div class="space-y-1">
                    <label hlmLabel class="text-xs">Password</label>
                    <app-editor-variable-input
                      [value]="connection().password"
                      type="password"
                      name="pgPassword"
                      (valueChange)="patchConnection({ password: $event })"
                    />
                  </div>
                  <div class="space-y-1">
                    <label hlmLabel class="text-xs">SSL Mode</label>
                    <select
                      class="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
                      [ngModel]="connection().sslMode"
                      (ngModelChange)="patchConnection({ sslMode: $event })"
                      name="sslMode"
                    >
                      @for (option of sslModeOptions; track option.value) {
                        <option [value]="option.value">{{ option.label }}</option>
                      }
                    </select>
                  </div>
                </div>
              </section>

              <section class="space-y-2 rounded-md border p-3">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Table Creation
                </p>
                <div class="grid grid-cols-2 gap-2">
                  <div class="space-y-1">
                    <label hlmLabel class="text-xs">Spatial Column Type</label>
                    <select
                      class="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
                      [ngModel]="tableCreation().spatialColumnType"
                      (ngModelChange)="patchTableCreation({ spatialColumnType: $event })"
                      name="spatialColumnType"
                    >
                      @for (option of spatialColumnTypeOptions; track option.value) {
                        <option [value]="option.value">{{ option.label }}</option>
                      }
                    </select>
                  </div>
                  <div class="space-y-1">
                    <label hlmLabel class="text-xs">Spatial Column Name</label>
                    <input
                      hlmInput
                      class="text-xs"
                      [ngModel]="tableCreation().spatialColumnName"
                      (ngModelChange)="patchTableCreation({ spatialColumnName: $event })"
                      name="spatialColumnName"
                    />
                  </div>
                </div>
                <label class="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    class="accent-primary"
                    [checked]="tableCreation().createGenericSpatialColumns"
                    (change)="patchTableCreation({ createGenericSpatialColumns: $any($event.target).checked })"
                  />
                  Create Generic Spatial Columns
                </label>
                <label class="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    class="accent-primary"
                    [checked]="tableCreation().lowerCaseAttributeNames"
                    (change)="patchTableCreation({ lowerCaseAttributeNames: $any($event.target).checked })"
                  />
                  Lower Case Attribute Names
                </label>
              </section>

              @if (selectedFeatureType(); as featureType) {
                <section class="space-y-2 rounded-md border p-3">
                  <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Feature Type Target
                  </p>
                  <div class="grid grid-cols-2 gap-2">
                    <div class="space-y-1">
                      <label hlmLabel class="text-xs">Name</label>
                      <input
                        hlmInput
                        class="text-xs"
                        [ngModel]="featureType.name"
                        (ngModelChange)="updateFeatureType(featureType.id, { name: $event })"
                        name="ftName"
                      />
                    </div>
                    <div class="space-y-1">
                      <label hlmLabel class="text-xs">Table Name</label>
                      <app-editor-variable-input
                        [value]="featureType.tableName"
                        name="ftTable"
                        (valueChange)="updateFeatureType(featureType.id, { tableName: $event })"
                      />
                    </div>
                    <div class="space-y-1">
                      <label hlmLabel class="text-xs">Schema</label>
                      <app-editor-variable-input
                        [value]="featureType.schema"
                        name="ftSchema"
                        (valueChange)="updateFeatureType(featureType.id, { schema: $event })"
                      />
                    </div>
                  </div>
                </section>
              }
            </div>
          </div>

          <hlm-dialog-footer>
            <button hlmBtn variant="ghost" type="button" (click)="close()">Annuler</button>
            <button hlmBtn type="button" (click)="save()">OK</button>
          </hlm-dialog-footer>
        </hlm-dialog-content>
      </ng-template>
    </hlm-dialog>
  `,
})
export class EditorFormatParamsDialogComponent {
  readonly node = input.required<EtlPipelineNode>();
  readonly openToken = input(0);

  readonly saved = output<Record<string, unknown>>();

  readonly dialogState = signal<'open' | 'closed'>('closed');
  readonly selectedFeatureTypeId = signal<string | null>(null);

  readonly sslModeOptions = SSL_MODE_OPTIONS;
  readonly spatialColumnTypeOptions = SPATIAL_COLUMN_TYPE_OPTIONS;

  private draftConnection = signal<PostgisConnectionConfig | null>(null);
  private draftTableCreation = signal<PostgisTableCreationConfig | null>(null);
  private draftFeatureTypes = signal<FeatureTypeDef[] | null>(null);
  private lastOpenToken = 0;

  constructor() {
    effect(() => {
      const token = this.openToken();
      if (token > 0 && token !== this.lastOpenToken) {
        this.lastOpenToken = token;
        this.openDialog();
      }
    });
  }

  featureTypes(): FeatureTypeDef[] {
    return this.draftFeatureTypes() ?? getFeatureTypes(this.node());
  }

  connection(): PostgisConnectionConfig {
    return this.draftConnection() ?? getPostgisConnection(this.node());
  }

  tableCreation(): PostgisTableCreationConfig {
    return this.draftTableCreation() ?? getPostgisTableCreation(this.node());
  }

  selectedFeatureType(): FeatureTypeDef | null {
    const id = this.selectedFeatureTypeId();
    return this.featureTypes().find((item) => item.id === id) ?? this.featureTypes()[0] ?? null;
  }

  openDialog(): void {
    const types = getFeatureTypes(this.node());
    this.draftConnection.set(getPostgisConnection(this.node()));
    this.draftTableCreation.set(getPostgisTableCreation(this.node()));
    this.draftFeatureTypes.set(types.map((item) => ({ ...item })));
    this.selectedFeatureTypeId.set(types[0]?.id ?? null);
    this.dialogState.set('closed');
    this.dialogState.set('open');
  }

  close(): void {
    this.dialogState.set('closed');
  }

  save(): void {
    const selected = this.selectedFeatureType();
    this.saved.emit({
      postgisConnection: this.connection(),
      postgisTableCreation: this.tableCreation(),
      featureTypes: this.featureTypes(),
      ...(selected ? { tableName: selected.tableName, schema: selected.schema } : {}),
    });
    this.close();
  }

  onDialogStateChanged(state: 'open' | 'closed'): void {
    this.dialogState.set(state);
  }

  patchConnection(patch: Partial<PostgisConnectionConfig>): void {
    this.draftConnection.set({ ...this.connection(), ...patch });
  }

  patchTableCreation(patch: Partial<PostgisTableCreationConfig>): void {
    this.draftTableCreation.set({ ...this.tableCreation(), ...patch });
  }

  addFeatureType(): void {
    const next = createDefaultFeatureType(this.node());
    const list = [...this.featureTypes(), next];
    this.draftFeatureTypes.set(list);
    this.selectedFeatureTypeId.set(next.id);
  }

  removeSelectedFeatureType(): void {
    const id = this.selectedFeatureTypeId();
    if (!id) {
      return;
    }
    const list = this.featureTypes().filter((item) => item.id !== id);
    this.draftFeatureTypes.set(list.length > 0 ? list : [createDefaultFeatureType(this.node())]);
    this.selectedFeatureTypeId.set(this.featureTypes()[0]?.id ?? null);
  }

  updateFeatureType(id: string, patch: Partial<FeatureTypeDef>): void {
    const list = this.featureTypes().map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );
    this.draftFeatureTypes.set(list);
  }
}
