import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideChevronDown, LucideChevronUp, LucideDownload, LucideSearch, LucideTable, LucideTrash2 } from '@lucide/angular';
import {
  ExecutionLoggerService,
  type ExecutionLogFilter,
} from '@app/core/services/execution-logger.service';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmTableImports } from '@app/shared/ui/table';
import type { FeatureCollection } from 'geojson';
import type { NodeAttribute } from '../../services/editor-canvas.utils';
import { EditorMapPreviewComponent } from '../editor-map-preview/editor-map-preview.component';

type BottomDockTab = 'preview' | 'console' | 'attributes';

@Component({
  selector: 'app-editor-bottom-dock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucideChevronDown,
    LucideChevronUp,
    LucideTable,
    LucideSearch,
    LucideTrash2,
    LucideDownload,
    HlmButtonImports,
    HlmInputImports,
    HlmTableImports,
    EditorMapPreviewComponent,
  ],
  template: `
    <section class="flex h-full min-h-0 flex-col border-t bg-card">
      <div class="flex h-8 shrink-0 items-center justify-between border-b px-2 gap-2">
        <div class="inline-flex gap-0.5">
          <button
            hlmBtn
            size="sm"
            type="button"
            class="h-7 text-[10px] px-2"
            [variant]="activeTab() === 'preview' ? 'default' : 'ghost'"
            (click)="activeTab.set('preview')"
          >
            Visual Preview
          </button>
          <button
            hlmBtn
            size="sm"
            type="button"
            class="h-7 text-[10px] px-2"
            [variant]="activeTab() === 'console' ? 'default' : 'ghost'"
            (click)="activeTab.set('console')"
          >
            Logs & Console
          </button>
          <button
            hlmBtn
            size="sm"
            type="button"
            class="h-7 text-[10px] gap-1 px-2"
            [variant]="activeTab() === 'attributes' ? 'default' : 'ghost'"
            (click)="activeTab.set('attributes')"
          >
            <svg lucideTable class="size-3"></svg>
            Table attributaire
          </button>
        </div>
        <button
          hlmBtn
          variant="ghost"
          size="icon"
          type="button"
          class="size-7"
          title="Réduire le panneau"
          (click)="toggleCollapsed.emit()"
        >
          @if (collapsed()) {
            <svg lucideChevronUp class="size-3.5"></svg>
          } @else {
            <svg lucideChevronDown class="size-3.5"></svg>
          }
        </button>
      </div>

      @if (!collapsed()) {
        <div class="flex-1 min-h-0 overflow-hidden">
          @if (activeTab() === 'preview') {
            <app-editor-map-preview class="block h-full" [collection]="preview()" [srid]="srid()" />
          }
          @if (activeTab() === 'console') {
            <div class="flex h-full min-h-0 flex-col">
              <div class="flex flex-wrap items-center gap-2 border-b px-2 py-1.5">
                <select
                  class="border-input bg-background h-7 rounded-md border px-2 text-[10px]"
                  [ngModel]="logFilter()"
                  (ngModelChange)="logFilter.set($event)"
                  name="logFilter"
                >
                  @for (option of logFilterOptions; track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
                <div class="relative min-w-[10rem] flex-1 max-w-xs">
                  <svg
                    lucideSearch
                    class="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  ></svg>
                  <input
                    hlmInput
                    class="h-7 pl-7 text-[10px]"
                    placeholder="Rechercher dans la console..."
                    [ngModel]="logQuery()"
                    (ngModelChange)="logQuery.set($event)"
                    name="logQuery"
                  />
                </div>
                <button hlmBtn variant="outline" size="sm" type="button" class="h-7 text-[10px]" (click)="clearConsole()">
                  <svg lucideTrash2 class="size-3"></svg>
                  Effacer
                </button>
                <button hlmBtn variant="outline" size="sm" type="button" class="h-7 text-[10px]" (click)="downloadLog()">
                  <svg lucideDownload class="size-3"></svg>
                  Journal (.log)
                </button>
                <button hlmBtn variant="outline" size="sm" type="button" class="h-7 text-[10px]" (click)="downloadReport()">
                  <svg lucideDownload class="size-3"></svg>
                  Rapport (.json)
                </button>
              </div>

              <div class="flex-1 overflow-auto p-2">
                @if (executionStatus()) {
                  <p class="mb-2 text-xs font-medium">{{ executionStatus() }} — {{ executionProgress() }} %</p>
                }
                @if (filteredLogLines().length === 0) {
                  <p class="text-[10px] text-muted-foreground">Aucun log pour le moment.</p>
                } @else {
                  <pre class="text-[10px] font-mono whitespace-pre-wrap leading-relaxed">
@for (line of filteredLogLines(); track line) {
{{ line }}
}
                  </pre>
                }
              </div>
            </div>
          }
          @if (activeTab() === 'attributes') {
            <div class="h-full overflow-auto">
              <table hlmTable class="w-full text-xs">
                <thead hlmTHead class="bg-muted/50 sticky top-0">
                  <tr hlmTr>
                    <th hlmTh>Name</th>
                    <th hlmTh>Type</th>
                  </tr>
                </thead>
                <tbody hlmTBody>
                  @for (attr of attributes(); track attr.name) {
                    <tr hlmTr>
                      <td hlmTd class="font-mono">{{ attr.name }}</td>
                      <td hlmTd>{{ attr.type }}</td>
                    </tr>
                  } @empty {
                    <tr hlmTr>
                      <td hlmTd colspan="2" class="text-muted-foreground">Sélectionnez un nœud.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class EditorBottomDockComponent {
  private readonly executionLogger = inject(ExecutionLoggerService);

  readonly preview = input<FeatureCollection | null>(null);
  readonly attributes = input<NodeAttribute[]>([]);
  readonly srid = input(4326);
  readonly executionStatus = input('');
  readonly executionProgress = input(0);
  readonly collapsed = input(false);

  readonly toggleCollapsed = output<void>();

  readonly activeTab = signal<BottomDockTab>('preview');
  readonly logFilter = signal<ExecutionLogFilter>('all');
  readonly logQuery = signal('');

  readonly logFilterOptions: Array<{ value: ExecutionLogFilter; label: string }> = [
    { value: 'all', label: 'Tous' },
    { value: 'info', label: 'Infos' },
    { value: 'warn', label: 'Avertissements' },
    { value: 'error', label: 'Erreurs' },
  ];

  readonly filteredLogLines = computed(() =>
    this.executionLogger
      .filterEntries(this.logFilter(), this.logQuery())
      .map((entry) => `${entry.timestamp} | ${entry.level.padEnd(5)} | ${entry.nodeLabel ? `[${entry.nodeLabel}] ` : ''}${entry.message}`),
  );

  clearConsole(): void {
    this.executionLogger.clear();
  }

  downloadLog(): void {
    this.executionLogger.downloadLogFile();
  }

  downloadReport(): void {
    this.executionLogger.downloadJsonReport();
  }
}
