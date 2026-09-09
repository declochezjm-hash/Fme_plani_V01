import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  LucideBookmark,
  LucideChevronDown,
  LucideChevronRight,
  LucideCog,
  LucideDatabase,
  LucideWorkflow,
  LucideWrench,
} from '@lucide/angular';
import type { EtlPipelineJson } from '../../../copilot/copilot.types';
import { MACRO_VARIABLE_SUGGESTIONS } from '../../services/editor-node-config.types';

type NavigatorSection = 'readers' | 'writers' | 'transformers' | 'bookmarks' | 'parameters';

@Component({
  selector: 'app-editor-navigator-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideChevronRight,
    LucideChevronDown,
    LucideDatabase,
    LucideWorkflow,
    LucideWrench,
    LucideBookmark,
    LucideCog,
  ],
  template: `
    <div class="flex h-full min-h-0 flex-col bg-card">
      <p class="border-b px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Navigator
      </p>
      <div class="flex-1 overflow-y-auto p-1 text-xs">
        @for (section of sections; track section.id) {
          <div class="mb-0.5">
            <button
              type="button"
              class="flex w-full items-center gap-1 rounded px-1.5 py-1 hover:bg-muted/60"
              (click)="toggleSection(section.id)"
            >
              @if (expanded()[section.id]) {
                <svg lucideChevronDown class="size-3 shrink-0 text-muted-foreground"></svg>
              } @else {
                <svg lucideChevronRight class="size-3 shrink-0 text-muted-foreground"></svg>
              }
              @switch (section.id) {
                @case ('readers') {
                  <svg lucideDatabase class="size-3 shrink-0"></svg>
                }
                @case ('writers') {
                  <svg lucideWorkflow class="size-3 shrink-0"></svg>
                }
                @case ('transformers') {
                  <svg lucideWrench class="size-3 shrink-0"></svg>
                }
                @case ('bookmarks') {
                  <svg lucideBookmark class="size-3 shrink-0"></svg>
                }
                @case ('parameters') {
                  <svg lucideCog class="size-3 shrink-0"></svg>
                }
              }
              <span class="truncate">
                @if (section.id === 'transformers') {
                  Transformers ({{ transformerCount() }})
                } @else {
                  {{ section.label }}
                }
              </span>
            </button>

            @if (expanded()[section.id]) {
              <div class="ml-4 space-y-0.5 border-l pl-2">
                @switch (section.id) {
                  @case ('readers') {
                    @for (node of readers(); track node.id) {
                      <button
                        type="button"
                        class="block w-full truncate rounded px-1.5 py-0.5 text-left hover:bg-muted/60"
                        [class]="selectedNodeId() === node.id ? 'bg-primary/15 text-primary' : ''"
                        (click)="selectNode.emit(node.id)"
                      >
                        {{ node.label }}
                      </button>
                    }
                    @if (readers().length === 0) {
                      <p class="px-1.5 py-0.5 text-muted-foreground">Aucun reader</p>
                    }
                  }
                  @case ('writers') {
                    @for (node of writers(); track node.id) {
                      <button
                        type="button"
                        class="block w-full truncate rounded px-1.5 py-0.5 text-left hover:bg-muted/60"
                        [class]="selectedNodeId() === node.id ? 'bg-primary/15 text-primary' : ''"
                        (click)="selectNode.emit(node.id)"
                      >
                        {{ node.label }}
                      </button>
                    }
                    @if (writers().length === 0) {
                      <p class="px-1.5 py-0.5 text-muted-foreground">Aucun writer</p>
                    }
                  }
                  @case ('transformers') {
                    @for (node of transformers(); track node.id) {
                      <button
                        type="button"
                        class="block w-full truncate rounded px-1.5 py-0.5 text-left hover:bg-muted/60"
                        [class]="selectedNodeId() === node.id ? 'bg-primary/15 text-primary' : ''"
                        (click)="selectNode.emit(node.id)"
                      >
                        {{ node.label }}
                      </button>
                    }
                    @if (transformers().length === 0) {
                      <p class="px-1.5 py-0.5 text-muted-foreground">Aucun transformeur</p>
                    }
                  }
                  @case ('bookmarks') {
                    @for (group of bookmarks(); track group.id) {
                      <button
                        type="button"
                        class="flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left hover:bg-muted/60"
                        (click)="selectGroup.emit(group.id)"
                      >
                        <span class="size-2 rounded-full shrink-0" [style.background]="group.color"></span>
                        {{ group.label }}
                      </button>
                    }
                    @if (bookmarks().length === 0) {
                      <p class="px-1.5 py-0.5 text-muted-foreground">Aucun bookmark</p>
                    }
                  }
                  @case ('parameters') {
                    @for (param of userParameters; track param) {
                      <p class="truncate rounded px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        $({{ param }})
                      </p>
                    }
                  }
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class EditorNavigatorPanelComponent {
  readonly pipeline = input.required<EtlPipelineJson>();
  readonly selectedNodeId = input<string | null>(null);

  readonly selectNode = output<string>();
  readonly selectGroup = output<string>();

  readonly userParameters = MACRO_VARIABLE_SUGGESTIONS;

  readonly sections: Array<{ id: NavigatorSection; label: string }> = [
    { id: 'readers', label: 'Readers' },
    { id: 'writers', label: 'Writers' },
    { id: 'transformers', label: 'Transformers' },
    { id: 'bookmarks', label: 'Bookmarks' },
    { id: 'parameters', label: 'User Parameters' },
  ];

  readonly expanded = signal<Record<NavigatorSection, boolean>>({
    readers: true,
    writers: true,
    transformers: true,
    bookmarks: false,
    parameters: false,
  });

  readonly readers = computed(() => this.pipeline().nodes.filter((node) => node.type === 'reader'));
  readonly writers = computed(() => this.pipeline().nodes.filter((node) => node.type === 'writer'));
  readonly transformers = computed(() =>
    this.pipeline().nodes.filter((node) => node.type !== 'reader' && node.type !== 'writer'),
  );
  readonly bookmarks = computed(() => this.pipeline().groups ?? []);

  readonly transformerCount = computed(() => this.transformers().length);

  toggleSection(id: NavigatorSection): void {
    this.expanded.update((state) => ({ ...state, [id]: !state[id] }));
  }
}
