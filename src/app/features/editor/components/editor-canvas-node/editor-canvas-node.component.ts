import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideFileInput,
  LucideFilter,
  LucideSettings,
  LucideUpload,
} from '@lucide/angular';
import type { EtlPipelineNode } from '../../../copilot/copilot.types';
import {
  getNodeAttributes,
  getNodeCategory,
  getNodeHeight,
  getNodePorts,
  getNodeTheme,
  NODE_HEADER_HEIGHT,
  NODE_WIDTH,
  type PortDef,
} from '../../services/editor-canvas.utils';

@Component({
  selector: 'app-editor-canvas-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideFileInput, LucideFilter, LucideSettings, LucideUpload],
  template: `
    <div
      class="node-shell absolute overflow-hidden rounded-lg shadow-lg transition-shadow"
      [class.ring-2]="selected()"
      [style.width.px]="width"
      [style.min-height.px]="height()"
      [style.left.px]="node().position.x"
      [style.top.px]="node().position.y"
      [style.border-color]="theme().border"
      [style.box-shadow]="selected() ? '0 0 0 2px ' + theme().glow + ', 0 8px 24px rgba(0,0,0,0.18)' : '0 4px 14px rgba(0,0,0,0.12)'"
      [class.node-dark]="dark()"
      [class.node-light]="!dark()"
      (pointerdown)="onPointerDown($event)"
      (click)="select.emit(node().id)"
      (contextmenu)="contextMenu.emit($event)"
    >
      <div
        class="node-header flex items-center gap-2 px-3 text-[11px] font-semibold tracking-wide uppercase"
        [style.height.px]="headerHeight"
        [style.background]="theme().headerBg"
        [style.color]="theme().headerText"
      >
        @if (theme().icon === 'file') {
          <svg lucideFileInput class="size-3.5 shrink-0"></svg>
        } @else if (theme().icon === 'export') {
          <svg lucideUpload class="size-3.5 shrink-0"></svg>
        } @else {
          <svg lucideFilter class="size-3.5 shrink-0"></svg>
        }
        <span class="truncate flex-1">{{ node().label }}</span>
        <button
          type="button"
          class="node-settings-btn shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
          aria-label="Ouvrir les paramètres"
          (click)="onSettingsClick($event)"
          (pointerdown)="$event.stopPropagation()"
        >
          <svg lucideSettings class="size-3.5"></svg>
        </button>
      </div>

      <div class="node-body grid grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)_minmax(5.5rem,auto)] gap-1 px-2 py-2 text-[10px]">
        <div class="port-column port-column-left flex flex-col gap-1.5 pt-1">
          @for (port of leftPorts(); track port.id) {
            <button
              type="button"
              class="port-row port-left"
              [class.port-active]="connectingFromId() && port.side === 'right'"
              (pointerdown)="onPortPointerDown($event, port)"
            >
              <span class="port-dot" [style.background]="theme().border"></span>
              <span class="port-label">{{ port.label }}</span>
            </button>
          }
        </div>

        <div class="attr-column flex min-w-0 flex-col gap-0.5 border-x border-border/50 px-1.5">
          <p class="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Attributs</p>
          @for (attr of attributes(); track attr.name) {
            <div class="attr-row flex items-center justify-between gap-1 font-mono min-w-0">
              <span class="attr-name text-foreground/90">{{ attr.name }}</span>
              <span class="attr-type shrink-0 rounded px-1 py-0 text-[8px]">{{ attr.type }}</span>
            </div>
          }
        </div>

        <div class="port-column port-column-right flex flex-col gap-1.5 pt-1">
          @for (port of rightPorts(); track port.id) {
            <button
              type="button"
              class="port-row port-right"
              (pointerdown)="onPortPointerDown($event, port)"
            >
              <span class="port-label">{{ port.label }}</span>
              <span class="port-dot" [style.background]="theme().border"></span>
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .node-shell {
      min-width: 240px;
      border-width: 1.5px;
      background: var(--node-bg, #ffffff);
      z-index: 10;
    }
    .node-dark {
      --node-bg: #252530;
      --node-muted: #9ca3af;
    }
    .node-light {
      --node-bg: #ffffff;
      --node-muted: #6b7280;
    }
    .node-body {
      background: var(--node-bg);
    }
    .port-column-left {
      align-items: flex-start;
    }
    .port-column-right {
      align-items: flex-end;
    }
    .port-row {
      display: flex;
      align-items: center;
      gap: 4px;
      width: 100%;
      padding: 2px 0;
      border: none;
      background: transparent;
      cursor: crosshair;
      color: var(--node-muted);
      font-size: 9px;
    }
    .port-row:hover {
      color: var(--foreground);
    }
    .port-left {
      justify-content: flex-start;
      text-align: left;
      padding-left: 2px;
    }
    .port-right {
      justify-content: flex-end;
      text-align: right;
      padding-right: 6px;
    }
    .port-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .port-dot {
      width: 8px;
      height: 8px;
      border-radius: 9999px;
      border: 2px solid var(--background);
      box-shadow: 0 0 0 1px currentColor;
      flex-shrink: 0;
    }
    .attr-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
      flex: 1;
    }
    .attr-type {
      background: color-mix(in oklch, var(--muted) 80%, transparent);
      color: var(--node-muted);
    }
    .node-settings-btn {
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      line-height: 0;
    }
    .node-header:hover .node-settings-btn {
      opacity: 1;
    }
  `,
})
export class EditorCanvasNodeComponent {
  readonly node = input.required<EtlPipelineNode>();
  readonly selected = input(false);
  readonly dark = input(false);
  readonly connectingFromId = input<string | null>(null);

  readonly select = output<string>();
  readonly pointerDown = output<PointerEvent>();
  readonly contextMenu = output<MouseEvent>();
  readonly openSettings = output<string>();
  readonly portPointerDown = output<{ event: PointerEvent; nodeId: string; port: PortDef }>();

  readonly width = NODE_WIDTH;
  readonly headerHeight = NODE_HEADER_HEIGHT;

  readonly category = () => getNodeCategory(this.node().type);
  readonly theme = () => getNodeTheme(this.category(), this.dark());
  readonly attributes = () => getNodeAttributes(this.node());
  readonly height = () => getNodeHeight(this.node());
  readonly leftPorts = () => getNodePorts(this.node()).filter((port) => port.side === 'left');
  readonly rightPorts = () => getNodePorts(this.node()).filter((port) => port.side === 'right');

  onPointerDown(event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('.port-row, .node-settings-btn')) {
      return;
    }
    this.pointerDown.emit(event);
  }

  onSettingsClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.openSettings.emit(this.node().id);
  }

  onPortPointerDown(event: PointerEvent, port: PortDef): void {
    event.stopPropagation();
    event.preventDefault();
    this.portPointerDown.emit({ event, nodeId: this.node().id, port });
  }
}
