import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideArrowDown, LucideArrowUp, LucideMinus, LucidePlus, LucideSearch } from '@lucide/angular';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmTableImports } from '@app/shared/ui/table';
import type { EtlPipelineNode } from '../../../copilot/copilot.types';
import {
  ATTRIBUTE_MODE_OPTIONS,
  USER_ATTRIBUTE_TYPE_OPTIONS,
  type AttributeDefinitionMode,
  type UserAttributeDef,
} from '../../services/editor-node-config.types';
import {
  createDefaultUserAttribute,
  getAttributeMode,
  getUserAttributes,
} from '../../services/editor-node-config.utils';

@Component({
  selector: 'app-editor-node-attributes-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucidePlus,
    LucideMinus,
    LucideArrowUp,
    LucideArrowDown,
    LucideSearch,
    HlmButtonImports,
    HlmInputImports,
    HlmTableImports,
  ],
  template: `
    <div class="flex flex-col gap-2 flex-1 min-h-0">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="space-y-1">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            User Attributes
          </p>
          <select
            class="border-input bg-background h-7 rounded-md border px-2 text-xs"
            [ngModel]="attributeMode()"
            (ngModelChange)="setAttributeMode($event)"
            name="attributeMode"
          >
            @for (option of attributeModeOptions; track option.value) {
              <option [value]="option.value">{{ option.label }}</option>
            }
          </select>
        </div>

        <div class="relative min-w-[10rem] flex-1 max-w-xs">
          <svg
            lucideSearch
            class="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          ></svg>
          <input
            hlmInput
            class="h-7 pl-7 text-xs"
            placeholder="Filtrer les attributs..."
            [ngModel]="filterQuery()"
            (ngModelChange)="filterQuery.set($event)"
            name="attrFilter"
          />
        </div>
      </div>

      <div class="rounded-md border overflow-hidden flex-1 min-h-0 overflow-y-auto">
        <table hlmTable class="w-full text-xs">
          <thead hlmTHead class="bg-muted/50 sticky top-0 z-10">
            <tr hlmTr>
              <th hlmTh class="w-8"></th>
              <th hlmTh>Name</th>
              <th hlmTh>Type</th>
              <th hlmTh class="w-16">Width</th>
              <th hlmTh class="w-16">Precision</th>
              <th hlmTh>Value</th>
              <th hlmTh class="w-12">Index</th>
            </tr>
          </thead>
          <tbody hlmTBody>
            @for (attr of filteredAttributes(); track attr.name; let index = $index) {
              <tr
                hlmTr
                class="cursor-pointer"
                [class]="selectedName() === attr.name ? 'bg-muted/40' : ''"
                (click)="selectedName.set(attr.name)"
              >
                <td hlmTd class="text-muted-foreground font-mono text-[10px]">{{ index + 1 }}</td>
                <td hlmTd>
                  <input
                    class="border-input bg-background h-7 w-full rounded border px-1.5 font-mono text-xs"
                    [disabled]="attributeMode() === 'automatic'"
                    [ngModel]="attr.name"
                    (ngModelChange)="updateAttributeByName(attr.name, { name: $event })"
                    [name]="'name-' + attr.name"
                  />
                </td>
                <td hlmTd>
                  <select
                    class="border-input bg-background h-7 w-full rounded border px-1 text-xs"
                    [disabled]="attributeMode() === 'automatic'"
                    [ngModel]="attr.type"
                    (ngModelChange)="updateAttributeByName(attr.name, { type: $event })"
                    [name]="'type-' + attr.name"
                  >
                    @for (option of attributeTypeOptions; track option.value) {
                      <option [value]="option.value">{{ option.label }}</option>
                    }
                  </select>
                </td>
                <td hlmTd>
                  <input
                    type="number"
                    class="border-input bg-background h-7 w-full rounded border px-1 text-xs"
                    [disabled]="attributeMode() === 'automatic'"
                    [ngModel]="attr.width"
                    (ngModelChange)="updateAttributeByName(attr.name, { width: +$event })"
                    [name]="'width-' + attr.name"
                  />
                </td>
                <td hlmTd>
                  <input
                    type="number"
                    class="border-input bg-background h-7 w-full rounded border px-1 text-xs"
                    [disabled]="attributeMode() === 'automatic'"
                    [ngModel]="attr.precision"
                    (ngModelChange)="updateAttributeByName(attr.name, { precision: +$event })"
                    [name]="'precision-' + attr.name"
                  />
                </td>
                <td hlmTd>
                  <input
                    class="border-input bg-background h-7 w-full rounded border px-1.5 text-xs"
                    [disabled]="attributeMode() === 'automatic'"
                    [ngModel]="attr.value"
                    (ngModelChange)="updateAttributeByName(attr.name, { value: $event })"
                    [name]="'value-' + attr.name"
                  />
                </td>
                <td hlmTd class="text-center">
                  <input
                    type="checkbox"
                    class="accent-primary"
                    [disabled]="attributeMode() === 'automatic'"
                    [checked]="attr.index"
                    (change)="updateAttributeByName(attr.name, { index: $any($event.target).checked })"
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="flex flex-wrap gap-1 border-t pt-2">
        <button hlmBtn variant="outline" size="sm" type="button" class="h-7 px-2" (click)="addAttribute()">
          <svg lucidePlus class="size-3.5"></svg>
        </button>
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          class="h-7 px-2"
          [disabled]="selectedName() === null"
          (click)="removeSelected()"
        >
          <svg lucideMinus class="size-3.5"></svg>
        </button>
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          class="h-7 px-2"
          [disabled]="selectedName() === null || selectedIndex() === 0"
          (click)="moveSelected(-1)"
        >
          <svg lucideArrowUp class="size-3.5"></svg>
        </button>
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          class="h-7 px-2"
          [disabled]="selectedName() === null || selectedIndex() === attributes().length - 1"
          (click)="moveSelected(1)"
        >
          <svg lucideArrowDown class="size-3.5"></svg>
        </button>
        <span class="mx-1 w-px self-stretch bg-border"></span>
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          class="h-7 px-2 text-xs"
          [disabled]="selectedName() === null"
          title="Couper"
          (click)="cutSelected()"
        >
          ✂
        </button>
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          class="h-7 px-2 text-xs"
          [disabled]="selectedName() === null"
          title="Copier"
          (click)="copySelected()"
        >
          📋
        </button>
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          class="h-7 px-2 text-xs"
          [disabled]="clipboard() === null"
          title="Coller"
          (click)="pasteClipboard()"
        >
          📥
        </button>
      </div>
    </div>
  `,
})
export class EditorNodeAttributesTableComponent {
  private static clipboard: UserAttributeDef | null = null;

  readonly node = input.required<EtlPipelineNode>();

  readonly configPatch = output<Record<string, unknown>>();

  readonly filterQuery = signal('');
  readonly selectedName = signal<string | null>(null);
  readonly clipboard = signal<UserAttributeDef | null>(EditorNodeAttributesTableComponent.clipboard);

  readonly attributeModeOptions = ATTRIBUTE_MODE_OPTIONS;
  readonly attributeTypeOptions = USER_ATTRIBUTE_TYPE_OPTIONS;

  readonly attributes = computed(() => getUserAttributes(this.node()));

  readonly attributeMode = computed(() => getAttributeMode(this.node()));

  readonly filteredAttributes = computed(() => {
    const query = this.filterQuery().trim().toLowerCase();
    if (!query) {
      return this.attributes();
    }
    return this.attributes().filter((attr) => attr.name.toLowerCase().includes(query));
  });

  readonly selectedIndex = computed(() => {
    const name = this.selectedName();
    if (!name) {
      return null;
    }
    const index = this.attributes().findIndex((attr) => attr.name === name);
    return index >= 0 ? index : null;
  });

  setAttributeMode(mode: AttributeDefinitionMode): void {
    this.configPatch.emit({ attributeMode: mode });
  }

  private emitAttributes(next: UserAttributeDef[]): void {
    this.configPatch.emit({ userAttributes: next, attributeMode: 'manual' });
  }

  addAttribute(): void {
    const next = createDefaultUserAttribute();
    this.emitAttributes([...this.attributes(), next]);
    this.selectedName.set(next.name);
  }

  removeSelected(): void {
    const index = this.selectedIndex();
    if (index === null) {
      return;
    }
    const next = this.attributes().filter((_, itemIndex) => itemIndex !== index);
    this.emitAttributes(next.length > 0 ? next : [createDefaultUserAttribute()]);
    this.selectedName.set(null);
  }

  moveSelected(direction: -1 | 1): void {
    const index = this.selectedIndex();
    if (index === null) {
      return;
    }
    const target = index + direction;
    const list = [...this.attributes()];
    if (target < 0 || target >= list.length) {
      return;
    }
    const [item] = list.splice(index, 1);
    list.splice(target, 0, item);
    this.emitAttributes(list);
    this.selectedName.set(item.name);
  }

  updateAttributeByName(name: string, partial: Partial<UserAttributeDef>): void {
    const next = this.attributes().map((attr) =>
      attr.name === name ? { ...attr, ...partial } : attr,
    );
    if (partial.name && partial.name !== name) {
      this.selectedName.set(partial.name);
    }
    this.emitAttributes(next);
  }

  private getSelectedAttribute(): UserAttributeDef | null {
    const name = this.selectedName();
    if (!name) {
      return null;
    }
    return this.attributes().find((attr) => attr.name === name) ?? null;
  }

  private setClipboard(item: UserAttributeDef | null): void {
    EditorNodeAttributesTableComponent.clipboard = item;
    this.clipboard.set(item);
  }

  copySelected(): void {
    const selected = this.getSelectedAttribute();
    if (!selected) {
      return;
    }
    this.setClipboard({ ...selected });
  }

  cutSelected(): void {
    const selected = this.getSelectedAttribute();
    if (!selected) {
      return;
    }
    this.setClipboard({ ...selected });
    this.removeSelected();
  }

  pasteClipboard(): void {
    const item = EditorNodeAttributesTableComponent.clipboard;
    if (!item) {
      return;
    }
    const pasted: UserAttributeDef = {
      ...item,
      name: `${item.name}_copy`,
    };
    this.emitAttributes([...this.attributes(), pasted]);
    this.selectedName.set(pasted.name);
  }
}
