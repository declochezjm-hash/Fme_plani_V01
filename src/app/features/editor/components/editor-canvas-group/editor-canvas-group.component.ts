import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { EtlPipelineGroup } from '../../../copilot/copilot.types';
import { EditorService } from '../../editor.service';

export type GroupResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

@Component({
  selector: 'app-editor-canvas-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="editor-group"
      [class.editor-group-selected]="selected()"
      [style.left.px]="group().position.x"
      [style.top.px]="group().position.y"
      [style.width.px]="group().size.width"
      [style.height.px]="group().size.height"
      [style.border-color]="group().color"
      [style.--group-color]="group().color"
      [style.pointer-events]="'none'"
    >
      <div
        class="editor-group-header"
        [class.editor-group-header-editing]="isEditing()"
        [style.background]="headerBackground()"
        [style.color]="group().color"
        [style.pointer-events]="'auto'"
        (pointerdown)="onHeaderPointerDown($event)"
        (dblclick)="onTitleDblClick($event)"
        (contextmenu)="contextMenu.emit($event)"
      >
        @if (isEditing()) {
          <input
            #labelInput
            type="text"
            class="editor-group-header-input"
            [class.editor-group-header-input-dark]="dark()"
            [class.editor-group-header-input-light]="!dark()"
            [value]="draftLabel()"
            (input)="draftLabel.set($any($event.target).value)"
            (keydown.enter)="onEnter($event)"
            (keydown.escape)="onEscape()"
            (blur)="onBlur()"
            (click)="$event.stopPropagation()"
            (pointerdown)="$event.stopPropagation()"
            (mousedown)="$event.stopPropagation()"
          />
        } @else {
          <span class="editor-group-title">{{ group().label }}</span>
        }

        @if (!isEditing()) {
          <button
            type="button"
            class="editor-group-delete"
            [style.pointer-events]="'auto'"
            aria-label="Supprimer le groupe"
            (click)="deleteClick.emit($event)"
            (pointerdown)="$event.stopPropagation()"
          >
            ×
          </button>
        }
      </div>

      @if (selected()) {
        <span
          class="resize-handle resize-nw"
          [style.pointer-events]="'auto'"
          (pointerdown)="resizePointerDown.emit({ event: $event, corner: 'nw' })"
        ></span>
        <span
          class="resize-handle resize-ne"
          [style.pointer-events]="'auto'"
          (pointerdown)="resizePointerDown.emit({ event: $event, corner: 'ne' })"
        ></span>
        <span
          class="resize-handle resize-sw"
          [style.pointer-events]="'auto'"
          (pointerdown)="resizePointerDown.emit({ event: $event, corner: 'sw' })"
        ></span>
        <span
          class="resize-handle resize-se"
          [style.pointer-events]="'auto'"
          (pointerdown)="resizePointerDown.emit({ event: $event, corner: 'se' })"
        ></span>
      }
    </div>
  `,
  styles: `
    .editor-group {
      position: absolute;
      z-index: 1;
      border-width: 2px;
      border-style: dashed;
      border-radius: 10px;
      background: color-mix(in oklch, var(--group-color) 10%, transparent);
      box-sizing: border-box;
    }
    .editor-group-selected {
      border-style: solid;
      box-shadow: 0 0 0 1px color-mix(in oklch, var(--group-color) 35%, transparent);
    }
    .editor-group-header {
      position: absolute;
      top: -24px;
      left: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 6px;
      max-width: calc(100% - 8px);
      min-width: 6rem;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
      padding: 3px 6px 3px 10px;
      border-radius: 6px 6px 0 0;
      border: 1px solid color-mix(in oklch, var(--group-color) 40%, transparent);
      border-bottom: none;
      cursor: grab;
      backdrop-filter: blur(6px);
    }
    .editor-group-header-editing {
      z-index: 20;
      cursor: text;
      min-width: 10rem;
    }
    .editor-group-header:active:not(.editor-group-header-editing) {
      cursor: grabbing;
    }
    .editor-group-title {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      user-select: none;
    }
    .editor-group-header-input {
      flex: 1;
      min-width: 8rem;
      width: 100%;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1.5px solid color-mix(in oklch, var(--group-color) 55%, var(--border));
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in oklch, var(--group-color) 20%, transparent);
      pointer-events: auto;
    }
    .editor-group-header-input-light {
      background: #ffffff;
      color: #0f172a;
    }
    .editor-group-header-input-dark {
      background: #252530;
      color: #f1f5f9;
    }
    .editor-group-header-input:focus {
      border-color: var(--group-color);
      box-shadow: 0 0 0 2px color-mix(in oklch, var(--group-color) 35%, transparent);
    }
    .editor-group-delete {
      display: none;
      flex-shrink: 0;
      width: 1.1rem;
      height: 1.1rem;
      border: none;
      border-radius: 4px;
      background: color-mix(in oklch, var(--group-color) 20%, transparent);
      color: inherit;
      font-size: 13px;
      line-height: 1;
      cursor: pointer;
      padding: 0;
    }
    .editor-group-header:hover .editor-group-delete {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .editor-group-delete:hover {
      background: #ef4444;
      color: #fff;
    }
    .resize-handle {
      position: absolute;
      width: 10px;
      height: 10px;
      border-radius: 2px;
      background: var(--group-color);
      border: 1.5px solid #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    }
    .resize-nw { top: -5px; left: -5px; cursor: nwse-resize; }
    .resize-ne { top: -5px; right: -5px; cursor: nesw-resize; }
    .resize-sw { bottom: -5px; left: -5px; cursor: nesw-resize; }
    .resize-se { bottom: -5px; right: -5px; cursor: nwse-resize; }
  `,
})
export class EditorCanvasGroupComponent {
  private readonly editor = inject(EditorService);
  private readonly labelInput = viewChild<ElementRef<HTMLInputElement>>('labelInput');

  private lastEditTrigger = 0;
  private skipBlurCommit = false;

  readonly group = input.required<EtlPipelineGroup>();
  readonly selected = input(false);
  readonly dark = input(false);
  readonly editTrigger = input(0);

  readonly isEditing = signal(false);
  readonly draftLabel = signal('');

  readonly headerPointerDown = output<PointerEvent>();
  readonly contextMenu = output<MouseEvent>();
  readonly deleteClick = output<MouseEvent>();
  readonly resizePointerDown = output<{ event: PointerEvent; corner: GroupResizeCorner }>();
  readonly editStarted = output<void>();

  constructor() {
    effect(() => {
      const trigger = this.editTrigger();
      if (trigger > 0 && trigger !== this.lastEditTrigger) {
        this.lastEditTrigger = trigger;
        this.beginEdit();
      }
    });
  }

  headerBackground(): string {
    return `color-mix(in oklch, ${this.group().color} 18%, transparent)`;
  }

  onHeaderPointerDown(event: PointerEvent): void {
    if (this.isEditing()) {
      event.stopPropagation();
      return;
    }
    this.headerPointerDown.emit(event);
  }

  onTitleDblClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.beginEdit();
  }

  beginEdit(): void {
    this.draftLabel.set(this.group().label);
    this.isEditing.set(true);
    this.editStarted.emit();

    afterNextRender(() => {
      const input = this.labelInput()?.nativeElement;
      if (!input) {
        return;
      }
      input.focus();
      input.select();
    });
  }

  onEnter(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.commitEdit();
  }

  onEscape(): void {
    this.skipBlurCommit = true;
    this.isEditing.set(false);
  }

  onBlur(): void {
    if (this.skipBlurCommit) {
      this.skipBlurCommit = false;
      return;
    }
    this.commitEdit();
  }

  private commitEdit(): void {
    if (!this.isEditing()) {
      return;
    }

    const label = this.draftLabel().trim();
    if (label && label !== this.group().label) {
      this.editor.updateGroup(this.group().id, { label });
    }

    this.isEditing.set(false);
  }
}
