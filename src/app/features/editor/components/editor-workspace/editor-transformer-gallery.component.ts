import { ChangeDetectionStrategy, Component, computed, output, signal } from '@angular/core';
import { LucideGripVertical, LucideSearch } from '@lucide/angular';
import { HlmInputImports } from '@app/shared/ui/input';
import { NODE_CATALOG } from '../../services/etl.types';

@Component({
  selector: 'app-editor-transformer-gallery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideSearch, LucideGripVertical, HlmInputImports],
  template: `
    <div class="flex h-full min-h-0 flex-col bg-card">
      <p class="border-b px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Transformer Gallery
      </p>
      <div class="border-b p-2">
        <div class="relative">
          <svg
            lucideSearch
            class="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          ></svg>
          <input
            hlmInput
            class="h-7 pl-7 text-xs"
            placeholder="Rechercher un transformeur..."
            [value]="query()"
            (input)="query.set($any($event.target).value)"
          />
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-1 text-xs">
        @for (group of groupedItems(); track group.category) {
          <p class="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {{ group.label }}
          </p>
          @for (item of group.items; track item.index) {
            <button
              type="button"
              class="mb-0.5 flex w-full items-center gap-1 rounded px-1.5 py-1 text-left hover:bg-muted/60"
              draggable="true"
              (dragstart)="onDragStart($event, item.index)"
              (click)="addCatalogItem.emit(item.index)"
            >
              <svg lucideGripVertical class="size-3 shrink-0 text-muted-foreground"></svg>
              <span class="truncate">{{ item.label }}</span>
            </button>
          }
        }
      </div>
    </div>
  `,
})
export class EditorTransformerGalleryComponent {
  readonly addCatalogItem = output<number>();

  readonly query = signal('');

  readonly groupedItems = computed(() => {
    const q = this.query().trim().toLowerCase();
    const categories: Array<{ category: string; label: string }> = [
      { category: 'reader', label: 'Readers' },
      { category: 'transformer', label: 'Transformers' },
      { category: 'writer', label: 'Writers' },
    ];

    return categories.map((cat) => ({
      ...cat,
      items: NODE_CATALOG
        .map((item, index) => ({ ...item, index }))
        .filter((item) => item.category === cat.category)
        .filter((item) => !q || item.label.toLowerCase().includes(q)),
    })).filter((group) => group.items.length > 0);
  });

  onDragStart(event: DragEvent, catalogIndex: number): void {
    const transfer = event.dataTransfer;
    if (!transfer) {
      return;
    }
    transfer.setData('application/gisforge-catalog-index', String(catalogIndex));
    transfer.setData('text/plain', NODE_CATALOG[catalogIndex]?.label ?? 'node');
    transfer.effectAllowed = 'copy';
  }
}
