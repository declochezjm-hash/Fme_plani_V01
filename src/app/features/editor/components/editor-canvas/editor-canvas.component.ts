import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  LucideBookmarkPlus,
  LucideMessageCircle,
  LucidePencil,
  LucideTrash2,
  LucideUnlink,
} from '@lucide/angular';
import { HlmButtonImports } from '@app/shared/ui/button';
import type { EtlPipelineEdge, EtlPipelineGroup, EtlPipelineJson, EtlPipelineNode } from '../../../copilot/copilot.types';
import {
  findInputPortAtPoint,
  findOutputPortAtPoint,
  getEdgeGeometry,
  getNodePorts,
  getPortPosition,
  GROUP_COLOR_PALETTE,
  GROUP_MIN_SIZE,
  type PortDef,
} from '../../services/editor-canvas.utils';
import { EditorService } from '../../editor.service';
import {
  EditorCanvasGroupComponent,
  type GroupResizeCorner,
} from '../editor-canvas-group/editor-canvas-group.component';
import { EditorCanvasNodeComponent } from '../editor-canvas-node/editor-canvas-node.component';

type ContextMenuTarget =
  | { kind: 'node'; nodeId: string; x: number; y: number }
  | { kind: 'edge'; edgeId: string; x: number; y: number }
  | { kind: 'group'; groupId: string; x: number; y: number };

interface ConnectionDrag {
  sourceNodeId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface ReconnectDrag {
  edgeId: string;
  end: 'source' | 'target';
  anchorX: number;
  anchorY: number;
  currentX: number;
  currentY: number;
}

interface GroupResize {
  groupId: string;
  corner: GroupResizeCorner;
  startX: number;
  startY: number;
  startPosition: { x: number; y: number };
  startSize: { width: number; height: number };
}

@Component({
  selector: 'app-editor-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block w-full outline-none',
    style: 'min-height: 32rem; height: 32rem;',
    tabindex: '0',
  },
  imports: [
    LucideBookmarkPlus,
    LucideMessageCircle,
    LucidePencil,
    LucideTrash2,
    LucideUnlink,
    HlmButtonImports,
    EditorCanvasGroupComponent,
    EditorCanvasNodeComponent,
  ],
  styles: `
    .canvas-root {
      touch-action: none;
      user-select: none;
      display: block;
      width: 100%;
      height: 100%;
      min-height: 32rem;
      transition: background-color 0.2s ease;
    }
    .canvas-light {
      background-color: #f4f6f8;
      background-image: radial-gradient(circle, #cbd5e1 1px, transparent 1px);
    }
    .canvas-dark {
      background-color: #1e1e24;
      background-image: radial-gradient(circle, #3f3f46 1px, transparent 1px);
    }
    .canvas-grid {
      background-size: 20px 20px;
    }
    .canvas-viewport {
      position: absolute;
      inset: 0;
      transform-origin: 0 0;
    }
    .edge-layer {
      z-index: 1;
    }
    .edge-hit {
      cursor: pointer;
    }
    .edge-glow {
      filter: drop-shadow(0 0 4px rgba(56, 189, 248, 0.85));
    }
    .edge-selected {
      filter: drop-shadow(0 0 6px rgba(56, 189, 248, 1));
    }
    .groups-layer {
      z-index: 1;
      pointer-events: none;
    }
    .color-swatch {
      width: 1rem;
      height: 1rem;
      border-radius: 9999px;
      border: 2px solid transparent;
      cursor: pointer;
    }
    .color-swatch:hover,
    .color-swatch-active {
      border-color: var(--foreground);
    }
    .context-menu {
      z-index: 30;
    }
    .canvas-toolbar {
      z-index: 20;
    }
    .edge-delete-btn {
      cursor: pointer;
      pointer-events: all;
    }
    .edge-handle {
      cursor: crosshair;
      pointer-events: all;
    }
    .guide-line {
      pointer-events: none;
      stroke-dasharray: 6 4;
    }
  `,
  template: `
    <div
      #canvasRoot
      class="canvas-root canvas-grid relative overflow-hidden rounded-lg border border-border"
      [class.canvas-dark]="dark()"
      [class.canvas-light]="!dark()"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointerleave)="onPointerLeave($event)"
      (click)="onCanvasClick($event)"
      (contextmenu)="onCanvasContextMenu($event)"
    >
      <div class="canvas-toolbar absolute top-2 right-2 flex gap-1 z-20">
        <button hlmBtn variant="outline" size="sm" type="button" class="h-7 text-xs" (click)="onAddGroup()">
          <svg lucideBookmarkPlus class="size-3.5"></svg>
          Groupe
        </button>
      </div>

      <div
        class="canvas-viewport"
        [style.transform]="viewportTransform()"
      >
      <svg class="edge-layer absolute inset-0 h-full w-full">
        <defs>
          <marker
            id="edge-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
          </marker>
          <marker
            id="edge-arrow-hover"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#38bdf8" />
          </marker>
        </defs>

        @if (connectionDrag(); as drag) {
          <path
            [attr.d]="guidePath(drag.startX, drag.startY, drag.currentX, drag.currentY)"
            fill="none"
            stroke="#38bdf8"
            stroke-width="2"
            class="guide-line"
            opacity="0.85"
          />
        }

        @if (reconnectDrag(); as drag) {
          <path
            [attr.d]="guidePath(drag.anchorX, drag.anchorY, drag.currentX, drag.currentY)"
            fill="none"
            stroke="#f59e0b"
            stroke-width="2"
            class="guide-line"
            opacity="0.85"
          />
        }

        @for (edge of pipeline().edges; track edge.id) {
          @if (edgeGeometry(edge); as geom) {
            <g
              class="edge-hit"
              [class.edge-glow]="hoveredEdgeId() === edge.id"
              [class.edge-selected]="selectedEdgeId() === edge.id"
              (mouseenter)="hoveredEdgeId.set(edge.id)"
              (mouseleave)="onEdgeMouseLeave(edge.id)"
              (click)="onEdgeClick($event, edge.id)"
              (contextmenu)="onEdgeContextMenu($event, edge.id)"
            >
              <path
                [attr.d]="geom.path"
                fill="none"
                stroke="transparent"
                stroke-width="16"
              />
              <path
                [attr.d]="geom.path"
                fill="none"
                [attr.stroke]="edgeStroke(edge.id)"
                stroke-width="2.5"
                [attr.marker-end]="edgeMarker(edge.id)"
                opacity="0.9"
              />

              @if (hoveredEdgeId() === edge.id || selectedEdgeId() === edge.id) {
                <circle
                  class="edge-handle"
                  [attr.cx]="geom.start.x"
                  [attr.cy]="geom.start.y"
                  r="5"
                  fill="#38bdf8"
                  stroke="#fff"
                  stroke-width="1.5"
                  (pointerdown)="onEdgeHandlePointerDown($event, edge.id, 'source')"
                />
                <circle
                  class="edge-handle"
                  [attr.cx]="geom.end.x"
                  [attr.cy]="geom.end.y"
                  r="5"
                  fill="#38bdf8"
                  stroke="#fff"
                  stroke-width="1.5"
                  (pointerdown)="onEdgeHandlePointerDown($event, edge.id, 'target')"
                />
                <g
                  class="edge-delete-btn"
                  [attr.transform]="'translate(' + (geom.midpoint.x - 8) + ',' + (geom.midpoint.y - 8) + ')'"
                  (click)="onDeleteEdge(edge.id, $event)"
                >
                  <circle cx="8" cy="8" r="8" fill="#ef4444" />
                  <path
                    d="M5 5 L11 11 M11 5 L5 11"
                    stroke="#ffffff"
                    stroke-width="1.5"
                    stroke-linecap="round"
                  />
                </g>
              }
            </g>
          }
        }
      </svg>

      <div class="groups-layer absolute inset-0">
        @for (group of groups(); track group.id) {
          <app-editor-canvas-group
            [group]="group"
            [selected]="selectedGroupId() === group.id"
            [dark]="dark()"
            [editTrigger]="groupEditTargetId() === group.id ? groupEditSeq() : 0"
            (headerPointerDown)="onGroupPointerDown($event, group)"
            (contextMenu)="onGroupContextMenu($event, group)"
            (deleteClick)="onGroupQuickDelete($event, group)"
            (resizePointerDown)="onGroupResizePointerDown($event.event, group, $event.corner)"
            (editStarted)="onGroupEditStarted()"
          />
        }
      </div>

      @if (pipeline().nodes.length === 0) {
        <div class="absolute inset-0 flex items-center justify-center p-6 text-center z-10">
          <p class="text-sm text-muted-foreground max-w-sm">
            Canvas vide — ajoutez des nœuds depuis la palette ou chargez le pipeline démo.
          </p>
        </div>
      }

      @for (node of pipeline().nodes; track node.id) {
        <app-editor-canvas-node
          [node]="node"
          [selected]="selectedNodeId() === node.id"
          [dark]="dark()"
          [connectingFromId]="connectionDrag()?.sourceNodeId ?? null"
          (select)="onSelectNode($event)"
          (pointerDown)="onNodePointerDown($event, node)"
          (contextMenu)="onNodeContextMenu($event, node)"
          (openSettings)="onOpenNodeSettings($event)"
          (portPointerDown)="onPortPointerDown($event)"
        />
      }
      </div>

      @if (contextMenu(); as menu) {
        <div
          class="context-menu absolute min-w-[12rem] rounded-md border bg-popover p-1 shadow-md"
          [style.left.px]="menu.x"
          [style.top.px]="menu.y"
          (click)="$event.stopPropagation()"
        >
          @if (menu.kind === 'node') {
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              class="w-full justify-start text-xs"
              (click)="onContextEdit(menu.nodeId)"
            >
              <svg lucidePencil class="size-3.5"></svg>
              Modifier
            </button>
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              class="w-full justify-start text-xs"
              (click)="onContextDeleteNode(menu.nodeId)"
            >
              <svg lucideTrash2 class="size-3.5"></svg>
              Supprimer
            </button>
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              class="w-full justify-start text-xs"
              (click)="onContextDetachNode(menu.nodeId)"
            >
              <svg lucideUnlink class="size-3.5"></svg>
              Détacher les liaisons
            </button>
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              class="w-full justify-start text-xs"
              (click)="onContextExplainNode(menu.nodeId)"
            >
              <svg lucideMessageCircle class="size-3.5"></svg>
              Expliquer avec le Copilote
            </button>
          }

          @if (menu.kind === 'edge') {
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              class="w-full justify-start text-xs"
              (click)="onContextDeleteEdge(menu.edgeId)"
            >
              <svg lucideTrash2 class="size-3.5"></svg>
              Supprimer
            </button>
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              class="w-full justify-start text-xs"
              (click)="onContextExplainEdge(menu.edgeId)"
            >
              <svg lucideMessageCircle class="size-3.5"></svg>
              Expliquer avec le Copilote
            </button>
          }

          @if (menu.kind === 'group') {
            <p class="px-2 py-1 text-[10px] font-medium text-muted-foreground">Couleur</p>
            <div class="flex flex-wrap gap-1.5 px-2 pb-2">
              @for (color of groupColors; track color) {
                <button
                  type="button"
                  class="color-swatch"
                  [class.color-swatch-active]="groupColor(menu.groupId) === color"
                  [style.background]="color"
                  [attr.aria-label]="'Couleur ' + color"
                  (click)="onContextSetGroupColor(menu.groupId, color)"
                ></button>
              }
            </div>
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              class="w-full justify-start text-xs"
              (click)="onContextRenameGroup(menu.groupId)"
            >
              <svg lucidePencil class="size-3.5"></svg>
              Renommer le groupe
            </button>
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              class="w-full justify-start text-xs"
              (click)="onContextDeleteGroupOnly(menu.groupId)"
            >
              <svg lucideTrash2 class="size-3.5"></svg>
              Supprimer le groupe uniquement
            </button>
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              class="w-full justify-start text-xs text-destructive hover:text-destructive"
              (click)="onContextDeleteGroupWithNodes(menu.groupId)"
            >
              <svg lucideTrash2 class="size-3.5"></svg>
              Supprimer le groupe et ses nœuds
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class EditorCanvasComponent {
  private readonly editor = inject(EditorService);

  readonly pipeline = input.required<EtlPipelineJson>();
  readonly selectedNodeId = input<string | null>(null);
  readonly selectedEdgeId = input<string | null>(null);
  readonly dark = input(false);

  readonly explainNode = output<string>();
  readonly openInspector = output<string>();

  private readonly draggingNodeId = signal<string | null>(null);
  private readonly dragOffset = signal({ x: 0, y: 0 });
  private readonly draggingGroupId = signal<string | null>(null);
  private readonly groupDragOffset = signal({ x: 0, y: 0 });
  private readonly groupResize = signal<GroupResize | null>(null);
  private activePointerId: number | null = null;

  readonly groupEditSeq = signal(0);
  readonly groupEditTargetId = signal<string | null>(null);
  private groupHeaderPointerAt = 0;
  readonly groupColors = GROUP_COLOR_PALETTE;

  readonly connectionDrag = signal<ConnectionDrag | null>(null);
  readonly reconnectDrag = signal<ReconnectDrag | null>(null);
  readonly contextMenu = signal<ContextMenuTarget | null>(null);
  readonly hoveredEdgeId = signal<string | null>(null);
  readonly selectedGroupId = signal<string | null>(null);

  readonly groups = computed(() => this.pipeline().groups ?? []);

  readonly scale = signal(1);
  readonly panOffset = signal({ x: 0, y: 0 });

  readonly viewportTransform = computed(
    () => `translate(${this.panOffset().x}px, ${this.panOffset().y}px) scale(${this.scale()})`,
  );

  readonly nodeById = computed(() => {
    const map = new Map<string, EtlPipelineNode>();
    for (const node of this.pipeline().nodes) {
      map.set(node.id, node);
    }
    return map;
  });

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Delete' && event.key !== 'Backspace') {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    event.preventDefault();

    const edgeId = this.selectedEdgeId();
    if (edgeId) {
      this.editor.deleteEdge(edgeId);
      return;
    }

    const nodeId = this.selectedNodeId();
    if (nodeId) {
      this.editor.deleteNode(nodeId);
      return;
    }

    const groupId = this.selectedGroupId();
    if (groupId) {
      this.editor.deleteGroup(groupId);
      this.selectedGroupId.set(null);
    }
  }

  groupColor(groupId: string): string | undefined {
    return this.groups().find((group) => group.id === groupId)?.color;
  }

  edgeColor(): string {
    return this.dark() ? '#94a3b8' : '#64748b';
  }

  edgeStroke(edgeId: string): string {
    if (this.hoveredEdgeId() === edgeId || this.selectedEdgeId() === edgeId) {
      return '#38bdf8';
    }
    return this.edgeColor();
  }

  edgeMarker(edgeId: string): string {
    if (this.hoveredEdgeId() === edgeId || this.selectedEdgeId() === edgeId) {
      return 'url(#edge-arrow-hover)';
    }
    return 'url(#edge-arrow)';
  }

  edgeGeometry(edge: EtlPipelineEdge) {
    const source = this.nodeById().get(edge.source);
    const target = this.nodeById().get(edge.target);
    if (!source || !target) {
      return null;
    }
    return getEdgeGeometry(source, target);
  }

  guidePath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.max(80, Math.abs(x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  onAddGroup(): void {
    const selectedId = this.selectedNodeId();
    const selectedNode = selectedId ? this.nodeById().get(selectedId) : undefined;
    const pan = this.panOffset();
    const groupId = this.editor.addGroup('Nouvelle étape', {
      panX: pan.x,
      panY: pan.y,
      aroundNode: selectedNode,
    });
    this.selectedGroupId.set(groupId);
    this.editor.selectNode(null);
    this.editor.selectEdge(null);
  }

  onSelectNode(nodeId: string): void {
    this.closeContextMenu();
    this.selectedGroupId.set(null);
    this.editor.selectNode(nodeId);
  }

  onOpenNodeSettings(nodeId: string): void {
    this.closeContextMenu();
    this.selectedGroupId.set(null);
    this.editor.selectNode(nodeId);
    this.openInspector.emit(nodeId);
  }

  onCanvasClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.context-menu')) {
      return;
    }
    this.closeContextMenu();
    this.editor.selectEdge(null);
    this.selectedGroupId.set(null);
  }

  onCanvasContextMenu(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.node-shell, .edge-hit, .editor-group')) {
      return;
    }
    event.preventDefault();
    this.closeContextMenu();
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  private screenToCanvas(
    clientX: number,
    clientY: number,
    canvas: HTMLElement,
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const pan = this.panOffset();
    const scale = this.scale();
    return {
      x: (clientX - rect.left - pan.x) / scale,
      y: (clientY - rect.top - pan.y) / scale,
    };
  }

  private rootCoords(event: { clientX: number; clientY: number }, canvas: HTMLElement): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private canvasCoords(event: { clientX: number; clientY: number }, canvas: HTMLElement): { x: number; y: number } {
    return this.screenToCanvas(event.clientX, event.clientY, canvas);
  }

  private getCanvasRoot(event: Event): HTMLElement | null {
    return (event.currentTarget as HTMLElement | null)?.closest('.canvas-root') as HTMLElement | null;
  }

  onNodeContextMenu(event: MouseEvent, node: EtlPipelineNode): void {
    event.preventDefault();
    event.stopPropagation();

    const canvas = this.getCanvasRoot(event);
    if (!canvas) {
      return;
    }

    const coords = this.rootCoords(event, canvas);
    this.contextMenu.set({ kind: 'node', nodeId: node.id, x: coords.x, y: coords.y });
    this.editor.selectNode(node.id);
  }

  onEdgeContextMenu(event: MouseEvent, edgeId: string): void {
    event.preventDefault();
    event.stopPropagation();

    const canvas = this.getCanvasRoot(event);
    if (!canvas) {
      return;
    }

    const coords = this.rootCoords(event, canvas);
    this.contextMenu.set({ kind: 'edge', edgeId, x: coords.x, y: coords.y });
    this.editor.selectEdge(edgeId);
  }

  onGroupContextMenu(event: MouseEvent, group: EtlPipelineGroup): void {
    event.preventDefault();
    event.stopPropagation();

    const canvas = this.getCanvasRoot(event);
    if (!canvas) {
      return;
    }

    const coords = this.rootCoords(event, canvas);
    this.contextMenu.set({ kind: 'group', groupId: group.id, x: coords.x, y: coords.y });
    this.selectedGroupId.set(group.id);
    this.editor.selectNode(null);
    this.editor.selectEdge(null);
  }

  onEdgeClick(event: MouseEvent, edgeId: string): void {
    event.stopPropagation();
    this.closeContextMenu();
    this.selectedGroupId.set(null);
    this.editor.selectEdge(edgeId);
  }

  onEdgeMouseLeave(edgeId: string): void {
    if (this.hoveredEdgeId() === edgeId && !this.reconnectDrag()) {
      this.hoveredEdgeId.set(null);
    }
  }

  onDeleteEdge(edgeId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.editor.deleteEdge(edgeId);
    this.hoveredEdgeId.set(null);
  }

  onEdgeHandlePointerDown(event: PointerEvent, edgeId: string, end: 'source' | 'target'): void {
    event.stopPropagation();
    event.preventDefault();

    const edge = this.pipeline().edges.find((item) => item.id === edgeId);
    if (!edge) {
      return;
    }

    const source = this.nodeById().get(edge.source);
    const target = this.nodeById().get(edge.target);
    if (!source || !target) {
      return;
    }

    const canvas = this.getCanvasRoot(event);
    if (!canvas) {
      return;
    }

    const coords = this.canvasCoords(event, canvas);
    const fixedNode = end === 'source' ? target : source;
    const fixedPortSide = end === 'source' ? 'target' : 'source';
    const fixedPort =
      fixedPortSide === 'source'
        ? getNodePorts(fixedNode).find((port) => port.side === 'right')
        : getNodePorts(fixedNode).find((port) => port.side === 'left');
    if (!fixedPort) {
      return;
    }

    const anchor = getPortPosition(fixedNode, fixedPort);
    canvas.setPointerCapture(event.pointerId);
    this.activePointerId = event.pointerId;

    this.reconnectDrag.set({
      edgeId,
      end,
      anchorX: anchor.x,
      anchorY: anchor.y,
      currentX: coords.x,
      currentY: coords.y,
    });
    this.editor.selectEdge(edgeId);
  }

  onNodePointerDown(event: PointerEvent, node: EtlPipelineNode): void {
    if ((event.target as HTMLElement).closest('.port-row')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.closeContextMenu();
    this.selectedGroupId.set(null);

    const canvas = this.getCanvasRoot(event);
    if (!canvas) {
      return;
    }

    const shell = (event.currentTarget as HTMLElement).closest('.node-shell') as HTMLElement;
    const coords = this.canvasCoords(event, canvas);

    shell.setPointerCapture(event.pointerId);
    this.activePointerId = event.pointerId;
    this.draggingNodeId.set(node.id);
    this.dragOffset.set({
      x: coords.x - node.position.x,
      y: coords.y - node.position.y,
    });
    this.editor.selectNode(node.id);
  }

  onContextRenameGroup(groupId: string): void {
    this.closeContextMenu();
    this.selectedGroupId.set(groupId);
    this.groupEditTargetId.set(groupId);
    this.groupEditSeq.update((value) => value + 1);
  }

  onGroupEditStarted(): void {
    this.draggingGroupId.set(null);
    if (this.activePointerId !== null) {
      this.activePointerId = null;
    }
  }

  onGroupQuickDelete(event: MouseEvent, group: EtlPipelineGroup): void {
    event.preventDefault();
    event.stopPropagation();
    this.editor.deleteGroup(group.id);
    if (this.selectedGroupId() === group.id) {
      this.selectedGroupId.set(null);
    }
    this.closeContextMenu();
  }

  onGroupPointerDown(event: PointerEvent, group: EtlPipelineGroup): void {
    if (event.button !== 0) {
      return;
    }

    const elapsed = event.timeStamp - this.groupHeaderPointerAt;
    this.groupHeaderPointerAt = event.timeStamp;
    if (elapsed > 0 && elapsed < 400) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.closeContextMenu();
    this.selectedGroupId.set(group.id);
    this.editor.selectNode(null);
    this.editor.selectEdge(null);

    const canvas = this.getCanvasRoot(event);
    if (!canvas) {
      return;
    }

    const coords = this.canvasCoords(event, canvas);
    canvas.setPointerCapture(event.pointerId);
    this.activePointerId = event.pointerId;
    this.draggingGroupId.set(group.id);
    this.groupDragOffset.set({
      x: coords.x - group.position.x,
      y: coords.y - group.position.y,
    });
  }

  onGroupResizePointerDown(event: PointerEvent, group: EtlPipelineGroup, corner: GroupResizeCorner): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeContextMenu();
    this.selectedGroupId.set(group.id);
    this.editor.selectNode(null);
    this.editor.selectEdge(null);

    const canvas = this.getCanvasRoot(event);
    if (!canvas) {
      return;
    }

    const coords = this.canvasCoords(event, canvas);
    canvas.setPointerCapture(event.pointerId);
    this.activePointerId = event.pointerId;

    this.groupResize.set({
      groupId: group.id,
      corner,
      startX: coords.x,
      startY: coords.y,
      startPosition: { ...group.position },
      startSize: { ...group.size },
    });
  }

  onPortPointerDown(payload: { event: PointerEvent; nodeId: string; port: PortDef }): void {
    const { event, nodeId, port } = payload;
    const node = this.nodeById().get(nodeId);
    if (!node) {
      return;
    }

    const canvas = this.getCanvasRoot(event);
    if (!canvas) {
      return;
    }

    const portPos = getPortPosition(node, port);
    const coords = this.canvasCoords(event, canvas);

    canvas.setPointerCapture(event.pointerId);
    this.activePointerId = event.pointerId;
    this.closeContextMenu();

    if (port.side === 'right') {
      this.connectionDrag.set({
        sourceNodeId: nodeId,
        startX: portPos.x,
        startY: portPos.y,
        currentX: coords.x,
        currentY: coords.y,
      });
      return;
    }

    const incoming = this.pipeline().edges.find((edge) => edge.target === nodeId);
    const sourceNode = incoming ? this.nodeById().get(incoming.source) : null;
    const sourcePort = sourceNode
      ? getNodePorts(sourceNode).find((item) => item.side === 'right')
      : null;
    if (incoming && sourceNode && sourcePort) {
      const anchor = getPortPosition(sourceNode, sourcePort);
      this.reconnectDrag.set({
        edgeId: incoming.id,
        end: 'target',
        anchorX: anchor.x,
        anchorY: anchor.y,
        currentX: coords.x,
        currentY: coords.y,
      });
      this.editor.selectEdge(incoming.id);
    }
  }

  onPointerMove(event: PointerEvent): void {
    const canvas = this.getCanvasRoot(event);
    if (!canvas) {
      return;
    }

    const coords = this.canvasCoords(event, canvas);

    const connection = this.connectionDrag();
    if (connection) {
      this.connectionDrag.set({ ...connection, currentX: coords.x, currentY: coords.y });
      return;
    }

    const reconnect = this.reconnectDrag();
    if (reconnect) {
      this.reconnectDrag.set({ ...reconnect, currentX: coords.x, currentY: coords.y });
      return;
    }

    const resize = this.groupResize();
    if (resize) {
      this.applyGroupResize(coords, resize);
      return;
    }

    const groupId = this.draggingGroupId();
    if (groupId) {
      const x = Math.max(0, coords.x - this.groupDragOffset().x);
      const y = Math.max(0, coords.y - this.groupDragOffset().y);
      this.editor.moveGroup(groupId, { x, y });
      return;
    }

    const nodeId = this.draggingNodeId();
    if (nodeId) {
      const x = Math.max(0, coords.x - this.dragOffset().x);
      const y = Math.max(0, coords.y - this.dragOffset().y);
      this.editor.moveNode(nodeId, { x, y });
    }
  }

  onPointerUp(event: PointerEvent): void {
    const canvas = this.getCanvasRoot(event);
    if (!canvas) {
      return;
    }

    const coords = this.canvasCoords(event, canvas);
    const nodes = this.pipeline().nodes;

    const connection = this.connectionDrag();
    if (connection) {
      const target = findInputPortAtPoint(nodes, coords.x, coords.y);
      if (target && target.nodeId !== connection.sourceNodeId) {
        this.editor.connectNodes(connection.sourceNodeId, target.nodeId);
      }
      this.connectionDrag.set(null);
    }

    const reconnect = this.reconnectDrag();
    if (reconnect) {
      if (reconnect.end === 'target') {
        const target = findInputPortAtPoint(nodes, coords.x, coords.y);
        if (target) {
          this.editor.reconnectEdge(reconnect.edgeId, target.nodeId);
        }
      } else {
        const source = findOutputPortAtPoint(nodes, coords.x, coords.y);
        if (source) {
          this.editor.reconnectEdgeSource(reconnect.edgeId, source.nodeId);
        }
      }
      this.reconnectDrag.set(null);
    }

    const nodeId = this.draggingNodeId();
    if (nodeId) {
      this.draggingNodeId.set(null);
    }

    const movedGroupId = this.draggingGroupId();
    if (movedGroupId) {
      this.draggingGroupId.set(null);
    }

    const resized = this.groupResize();
    if (resized) {
      this.groupResize.set(null);
    }

    if (this.activePointerId !== null) {
      try {
        canvas.releasePointerCapture(this.activePointerId);
      } catch {
        // pointer already released
      }
      this.activePointerId = null;
    }
  }

  onPointerLeave(event: PointerEvent): void {
    if (this.activePointerId === null) {
      return;
    }
    this.onPointerUp(event);
  }

  onContextEdit(nodeId: string): void {
    this.closeContextMenu();
    this.editor.selectNode(nodeId);
  }

  onContextDeleteNode(nodeId: string): void {
    this.closeContextMenu();
    this.editor.deleteNode(nodeId);
  }

  onContextDetachNode(nodeId: string): void {
    this.closeContextMenu();
    this.editor.detachNodeEdges(nodeId);
  }

  onContextExplainNode(nodeId: string): void {
    this.closeContextMenu();
    this.explainNode.emit(nodeId);
  }

  onContextDeleteEdge(edgeId: string): void {
    this.closeContextMenu();
    this.editor.deleteEdge(edgeId);
  }

  onContextExplainEdge(edgeId: string): void {
    this.closeContextMenu();
    const edge = this.pipeline().edges.find((item) => item.id === edgeId);
    if (edge) {
      this.explainNode.emit(edge.source);
    }
  }

  onContextDeleteGroupOnly(groupId: string): void {
    this.closeContextMenu();
    this.editor.deleteGroup(groupId);
    this.selectedGroupId.set(null);
  }

  onContextDeleteGroupWithNodes(groupId: string): void {
    this.closeContextMenu();
    this.editor.deleteGroupWithNodes(groupId);
    this.selectedGroupId.set(null);
  }

  onContextSetGroupColor(groupId: string, color: string): void {
    this.editor.updateGroup(groupId, { color });
  }

  private applyGroupResize(coords: { x: number; y: number }, resize: GroupResize): void {
    const dx = coords.x - resize.startX;
    const dy = coords.y - resize.startY;
    const min = GROUP_MIN_SIZE;

    let x = resize.startPosition.x;
    let y = resize.startPosition.y;
    let width = resize.startSize.width;
    let height = resize.startSize.height;

    switch (resize.corner) {
      case 'se':
        width = resize.startSize.width + dx;
        height = resize.startSize.height + dy;
        break;
      case 'sw':
        x = resize.startPosition.x + dx;
        width = resize.startSize.width - dx;
        height = resize.startSize.height + dy;
        break;
      case 'ne':
        y = resize.startPosition.y + dy;
        width = resize.startSize.width + dx;
        height = resize.startSize.height - dy;
        break;
      case 'nw':
        x = resize.startPosition.x + dx;
        y = resize.startPosition.y + dy;
        width = resize.startSize.width - dx;
        height = resize.startSize.height - dy;
        break;
    }

    if (width < min) {
      if (resize.corner === 'sw' || resize.corner === 'nw') {
        x -= min - width;
      }
      width = min;
    }

    if (height < min) {
      if (resize.corner === 'nw' || resize.corner === 'ne') {
        y -= min - height;
      }
      height = min;
    }

    x = Math.max(0, x);
    y = Math.max(0, y);

    this.editor.resizeGroup(resize.groupId, { x, y }, { width, height });
  }
}

