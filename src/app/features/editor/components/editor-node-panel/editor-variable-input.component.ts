import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideVariable } from '@lucide/angular';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmInputImports } from '@app/shared/ui/input';
import { MACRO_VARIABLE_SUGGESTIONS } from '../../services/editor-node-config.types';

@Component({
  selector: 'app-editor-variable-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideVariable, HlmButtonImports, HlmInputImports],
  template: `
    <div class="relative flex items-center gap-1">
      <input
        hlmInput
        class="w-full pr-8 text-xs font-mono"
        [class]="inputClass()"
        [type]="type()"
        [placeholder]="placeholder()"
        [ngModel]="value()"
        (ngModelChange)="onValueChange($event)"
        [name]="name()"
      />
      <div class="absolute right-1 top-1/2 -translate-y-1/2">
        <button
          hlmBtn
          variant="ghost"
          size="icon"
          type="button"
          class="size-6"
          title="Insérer une variable"
          (click)="toggleMenu()"
        >
          <svg lucideVariable class="size-3.5"></svg>
        </button>
      </div>

      @if (menuOpen()) {
        <div
          class="absolute right-0 top-full z-30 mt-1 min-w-[10rem] rounded-md border bg-popover p-1 shadow-md"
        >
          @for (variable of macroSuggestions; track variable) {
            <button
              type="button"
              class="w-full rounded px-2 py-1 text-left text-xs font-mono hover:bg-muted"
              (click)="insertVariable(variable)"
            >
              $({{ variable }})
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class EditorVariableInputComponent {
  readonly value = input('');
  readonly name = input('variableInput');
  readonly placeholder = input('');
  readonly type = input('text');
  readonly inputClass = input('');

  readonly valueChange = output<string>();

  readonly menuOpen = signal(false);
  readonly macroSuggestions = MACRO_VARIABLE_SUGGESTIONS;

  onValueChange(next: string): void {
    this.valueChange.emit(next);
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  insertVariable(variable: string): void {
    const macro = `$(${variable})`;
    const current = this.value();
    this.valueChange.emit(current ? `${current}${macro}` : macro);
    this.menuOpen.set(false);
  }
}
