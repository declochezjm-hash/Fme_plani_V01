import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { LucideMessageCircle } from '@lucide/angular';
import { HlmButtonImports } from '@app/shared/ui/button';
import type { EtlPipelineEdge, EtlPipelineJson, EtlPipelineNode } from '../../../copilot/copilot.types';

const NODE_WIDTH = 168;
const NODE_HEIGHT = 72;

interface ContextMenuState {
  nodeId: string;
  x: number;
  y: number;
}

@Component({
  selector: 'app-editor-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block w-full',
    style: 'min-height: 32rem; height: 32rem;',
  },
  imports: [LucideMessageCircle, HlmButtonImports],
  styles: `
    .canvas-root {
      touch-action: none;
      user-select: none;
      display: block;
      width: 100%;
      height: 100%;
      min-height: 32rem;
      background-color: var(--card);
    }
    .canvas-grid {
      background-color: color-mix(in oklch, var(--muted) 35%, var(--card));
      background-image: radial-gradient(circle, var(--border) 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .port {
      width: 10px;
      height: 10px;
      border-radius: 9999px;
      border: 2px solid var(--primary);
      background: var(--background);
      cursor: crosshair;
      z-index: 2;
    }
    .port:hover {
      background: var(--primary);
    }
    .node-card {
      width: ${NODE_WIDTH}px;
      min-height: ${NODE_HEIGHT}px;
      z-index: 1;
    }
    .edge-layer {
      z-index: 0;
    }
    .context-menu {
      z-index: 20;
    }
  `,
  template: `
    <div
      class="canvas-root canvas-grid relative overflow-hidden rounded-lg border border-border"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp()"
      (pointerleave)="onPointerUp()"
      (click)="closeContextMenu()"
      (contextmenu)="$event.preventDefault()"
    >
      <svg class="edge-layer absolute inset-0 h-full w-full pointer-events-none">
        @for (edge of pipeline().edges; track edge.id) {
          <path
            [attr.d]="edgePath(edge)"
            fill="none"
            stroke="var(--primary)"
            stroke-width="2"
            opacity="0.75"
          />
        }
      </svg>

      @if (pipeline().nodes.length === 0) {
        <div class="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p class="text-sm text-muted-foreground max-w-sm">
            Canvas vide — ajoutez des nœuds depuis la palette ou chargez le pipeline démo.
          </p>
        </div>
      }

      @for (node of pipeline().nodes; track node.id) {
        <div
          class="node-card absolute rounded-md border border-border bg-background shadow-md cursor-grab active:cursor-grabbing"
          [class.ring-2]="selectedNodeId() === node.id"
          [class.ring-primary]="selectedNodeId() === node.id"
          [class.border-primary]="connectingFromId() === node.id"
          [style.left.px]="node.position.x"
          [style.top.px]="node.position.y"
          (pointerdown)="onNodePointerDown($event, node)"
          (click)="selectNode.emit(node.id)"
          (contextmenu)="onNodeContextMenu($event, node)"
        >
          <button
            type="button"
            class="port absolute left-[-5px] top-1/2 -translate-y-1/2"
            title="Entrée"
            (click)="onPortClick($event, node.id, 'target')"
          ></button>
          <div class="p-3 pr-4">
            <p class="text-xs font-semibold truncate">{{ node.label }}</p>
            <p class="text-[10px] text-muted-foreground">{{ node.type }}</p>
          </div>
          <button
            type="button"
            class="port absolute right-[-5px] top-1/2 -translate-y-1/2"
            title="Sortie"
            (click)="onPortClick($event, node.id, 'source')"
          ></button>
        </div>
      }

      @if (contextMenu(); as menu) {
        <div
          class="context-menu absolute min-w-[11rem] rounded-md border bg-popover p-1 shadow-md"
          [style.left.px]="menu.x"
          [style.top.px]="menu.y"
          (click)="$event.stopPropagation()"
        >
          <button
            hlmBtn
            variant="ghost"
            size="sm"
            type="button"
            class="w-full justify-start text-xs"
            (click)="onExplainNode(menu.nodeId)"
          >
            <svg lucideMessageCircle class="size-3.5"></svg>
            Expliquer ce nœud
          </button>
        </div>
      }

      @if (connectingFromId()) {
        <p class="absolute top-2 left-2 z-10 text-[10px] bg-primary text-primary-foreground px-2 py-1 rounded-md">
          Cliquez sur une entrée pour connecter…
        </p>
      }
    </div>
  `,
})
export class EditorCanvasComponent {
  readonly pipeline = input.required<EtlPipelineJson>();
  readonly selectedNodeId = input<string | null>(null);

  readonly selectNode = output<string>();
  readonly moveNode = output<{ nodeId: string; position: { x: number; y: number } }>();
  readonly connectNodes = output<{ sourceId: string; targetId: string }>();
  readonly explainNode = output<string>();

  private readonly draggingNodeId = signal<string | null>(null);
  private readonly dragOffset = signal({ x: 0, y: 0 });
  readonly connectingFromId = signal<string | null>(null);
  readonly contextMenu = signal<ContextMenuState | null>(null);

  readonly nodeById = computed(() => {
    const map = new Map<string, EtlPipelineNode>();
    for (const node of this.pipeline().nodes) {
      map.set(node.id, node);
    }
    return map;
  });

  edgePath(edge: EtlPipelineEdge): string {
    const source = this.nodeById().get(edge.source);
    const target = this.nodeById().get(edge.target);
    if (!source || !target) {
      return '';
    }

    const x1 = source.position.x + NODE_WIDTH;
    const y1 = source.position.y + NODE_HEIGHT / 2;
    const x2 = target.position.x;
    const y2 = target.position.y + NODE_HEIGHT / 2;
    const dx = Math.max(60, (x2 - x1) / 2);

    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  onNodeContextMenu(event: MouseEvent, node: EtlPipelineNode): void {
    event.preventDefault();
    event.stopPropagation();

    const canvas = (event.currentTarget as HTMLElement).closest('.canvas-root') as HTMLElement;
    const rect = canvas.getBoundingClientRect();

    this.contextMenu.set({
      nodeId: node.id,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
    this.selectNode.emit(node.id);
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  onExplainNode(nodeId: string): void {
    this.closeContextMenu();
    this.explainNode.emit(nodeId);
  }

  onNodePointerDown(event: PointerEvent, node: EtlPipelineNode): void {
    if ((event.target as HTMLElement).closest('.port')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.closeContextMenu();

    const canvas = (event.currentTarget as HTMLElement).closest('.canvas-root') as HTMLElement;
    const canvasRect = canvas.getBoundingClientRect();

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.draggingNodeId.set(node.id);
    this.dragOffset.set({
      x: event.clientX - canvasRect.left - node.position.x,
      y: event.clientY - canvasRect.top - node.position.y,
    });
  }

  onPointerMove(event: PointerEvent): void {
    const nodeId = this.draggingNodeId();
    if (!nodeId) {
      return;
    }

    const canvas = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(0, event.clientX - canvas.left - this.dragOffset().x);
    const y = Math.max(0, event.clientY - canvas.top - this.dragOffset().y);
    this.moveNode.emit({ nodeId, position: { x, y } });
  }

  onPointerUp(): void {
    this.draggingNodeId.set(null);
  }

  onPortClick(event: Event, nodeId: string, portType: 'source' | 'target'): void {
    event.stopPropagation();

    const from = this.connectingFromId();
    if (!from && portType === 'source') {
      this.connectingFromId.set(nodeId);
      return;
    }

    if (from && portType === 'target' && from !== nodeId) {
      this.connectNodes.emit({ sourceId: from, targetId: nodeId });
      this.connectingFromId.set(null);
      return;
    }

    this.connectingFromId.set(null);
  }
}
