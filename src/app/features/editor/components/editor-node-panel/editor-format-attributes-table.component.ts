import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideSearch } from '@lucide/angular';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmTableImports } from '@app/shared/ui/table';
import type { EtlPipelineNode } from '../../../copilot/copilot.types';
import {
  FORMAT_ATTRIBUTE_TYPE_OPTIONS,
  type FormatAttributeDef,
} from '../../services/editor-node-config.types';
import { getFormatAttributes } from '../../services/editor-node-config.utils';

@Component({
  selector: 'app-editor-format-attributes-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideSearch, HlmButtonImports, HlmInputImports, HlmTableImports],
  template: `
    <div class="flex flex-col gap-2 flex-1 min-h-0">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Format Attributes
      </p>

      <div class="rounded-md border overflow-hidden flex-1 min-h-0 overflow-y-auto">
        <table hlmTable class="w-full text-xs">
          <thead hlmTHead class="bg-muted/50 sticky top-0 z-10">
            <tr hlmTr>
              <th hlmTh class="w-10">Exposed</th>
              <th hlmTh>Name</th>
              <th hlmTh>Type</th>
            </tr>
          </thead>
          <tbody hlmTBody>
            @for (attr of filteredAttributes(); track attr.name) {
              <tr hlmTr>
                <td hlmTd class="text-center">
                  <input
                    type="checkbox"
                    class="accent-primary"
                    [checked]="attr.exposed"
                    (change)="updateAttribute(attr.name, { exposed: $any($event.target).checked })"
                  />
                </td>
                <td hlmTd class="font-mono">{{ attr.name }}</td>
                <td hlmTd>
                  <select
                    class="border-input bg-background h-7 w-full rounded border px-1 text-xs font-mono"
                    [ngModel]="attr.type"
                    (ngModelChange)="updateAttribute(attr.name, { type: $event })"
                    [name]="'fmt-type-' + attr.name"
                  >
                    @for (type of typeOptions; track type) {
                      <option [value]="type">{{ type }}</option>
                    }
                  </select>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <div class="relative min-w-[10rem] flex-1 max-w-xs">
          <svg
            lucideSearch
            class="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          ></svg>
          <input
            hlmInput
            class="h-7 pl-7 text-xs"
            placeholder="Filter"
            [ngModel]="filterQuery()"
            (ngModelChange)="filterQuery.set($event)"
            name="formatAttrFilter"
          />
        </div>
        <button hlmBtn variant="outline" size="sm" type="button" class="h-7 text-xs" (click)="toggleSelectAll()">
          Select All
        </button>
      </div>
    </div>
  `,
})
export class EditorFormatAttributesTableComponent {
  readonly node = input.required<EtlPipelineNode>();

  readonly configPatch = output<Record<string, unknown>>();

  readonly filterQuery = signal('');
  readonly typeOptions = FORMAT_ATTRIBUTE_TYPE_OPTIONS;

  readonly attributes = computed(() => getFormatAttributes(this.node()));

  readonly filteredAttributes = computed(() => {
    const query = this.filterQuery().trim().toLowerCase();
    if (!query) {
      return this.attributes();
    }
    return this.attributes().filter((attr) => attr.name.toLowerCase().includes(query));
  });

  private emitAttributes(next: FormatAttributeDef[]): void {
    this.configPatch.emit({ formatAttributes: next });
  }

  updateAttribute(name: string, partial: Partial<FormatAttributeDef>): void {
    const next = this.attributes().map((attr) =>
      attr.name === name ? { ...attr, ...partial } : attr,
    );
    this.emitAttributes(next);
  }

  toggleSelectAll(): void {
    const allExposed = this.attributes().every((attr) => attr.exposed);
    const next = this.attributes().map((attr) => ({ ...attr, exposed: !allExposed }));
    this.emitAttributes(next);
  }
}
