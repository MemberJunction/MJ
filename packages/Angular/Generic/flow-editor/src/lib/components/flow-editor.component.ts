import {
  Component, Input, Output, EventEmitter, ViewChild, OnInit, OnDestroy,
  ChangeDetectorRef, ViewEncapsulation, ChangeDetectionStrategy, HostListener
} from '@angular/core';
import { Subject } from 'rxjs';
import { FFlowComponent, FCanvasComponent, FZoomDirective, FCreateConnectionEvent,
         FCreateNodeEvent, FSelectionChangeEvent, FCanvasChangeEvent, FMoveNodesEvent } from '@foblex/flow';
import {
  FlowNode, FlowConnection, FlowNodeTypeConfig, FlowNodeAddedEvent,
  FlowNodeMovedEvent, FlowConnectionCreatedEvent, FlowSelectionChangedEvent,
  FlowCanvasClickEvent, FlowPosition, FlowLayoutDirection,
  FlowContextMenuTarget, FlowContextMenuAction
} from '../interfaces/flow-types';
import { FlowStateService } from '../services/flow-state.service';
import { FlowLayoutService } from '../services/flow-layout.service';

/**
 * Generic, entity-agnostic visual flow editor component.
 * Wraps Foblex Flow to provide a clean MJ-style API.
 *
 * Usage:
 * ```html
 * <mj-flow-editor
 *   [Nodes]="myNodes"
 *   [Connections]="myConnections"
 *   [NodeTypes]="myNodeTypes"
 *   (NodeSelected)="onNodeSelected($event)"
 *   (ConnectionCreated)="onConnectionCreated($event)">
 * </mj-flow-editor>
 * ```
 */
@Component({
  selector: 'mj-flow-editor',
  templateUrl: './flow-editor.component.html',
  styleUrls: ['./flow-editor.component.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Default,
  providers: [FlowStateService, FlowLayoutService]
})
export class FlowEditorComponent implements OnInit, OnDestroy {
  // ── Inputs ──────────────────────────────────────────────────
  @Input() Nodes: FlowNode[] = [];
  @Input() Connections: FlowConnection[] = [];
  @Input() NodeTypes: FlowNodeTypeConfig[] = [];
  @Input() ReadOnly = false;
  @Input() ShowMinimap = true;
  @Input() ShowPalette = true;
  @Input() ShowGrid = true;
  @Input() ShowStatusBar = true;
  @Input() ShowToolbar = true;
  @Input() GridSize = 20;
  @Input() AutoLayoutDirection: FlowLayoutDirection = 'vertical';

  // ── Outputs ─────────────────────────────────────────────────
  @Output() NodeSelected = new EventEmitter<FlowNode | null>();
  @Output() NodeAdded = new EventEmitter<FlowNodeAddedEvent>();
  @Output() NodeRemoved = new EventEmitter<FlowNode>();
  @Output() NodeMoved = new EventEmitter<FlowNodeMovedEvent>();
  @Output() ConnectionCreated = new EventEmitter<FlowConnectionCreatedEvent>();
  @Output() ConnectionRemoved = new EventEmitter<FlowConnection>();
  @Output() ConnectionSelected = new EventEmitter<FlowConnection | null>();
  @Output() SelectionChanged = new EventEmitter<FlowSelectionChangedEvent>();
  @Output() CanvasClicked = new EventEmitter<FlowCanvasClickEvent>();
  @Output() NodesChanged = new EventEmitter<FlowNode[]>();
  @Output() ConnectionsChanged = new EventEmitter<FlowConnection[]>();
  @Output() NodeEditRequested = new EventEmitter<FlowNode>();
  @Output() ConnectionEditRequested = new EventEmitter<FlowConnection>();

  // ── View Children ───────────────────────────────────────────
  @ViewChild(FFlowComponent) protected fFlow: FFlowComponent | undefined;
  @ViewChild(FCanvasComponent) protected fCanvas: FCanvasComponent | undefined;
  @ViewChild('fZoomRef') protected fZoom: FZoomDirective | undefined;

  // ── Internal State ──────────────────────────────────────────
  protected zoomLevel = 100;
  protected canvasPosition = { x: 0, y: 0 };
  protected canvasScale = 1;
  protected selectedNodeIDs: string[] = [];
  protected selectedConnectionIDs: string[] = [];
  protected panMode = false;

  /** Trigger function for canvas panning — only allows panning in pan mode */
  protected canvasMoveTriggerFn = (_event: MouseEvent | TouchEvent): boolean => {
    return this.panMode;
  };

  /* Context menu state */
  protected contextMenuVisible = false;
  protected contextMenuX = 0;
  protected contextMenuY = 0;
  protected contextMenuTargetType: FlowContextMenuTarget = 'node';
  protected contextMenuNode: FlowNode | null = null;
  protected contextMenuConnection: FlowConnection | null = null;

  private destroy$ = new Subject<void>();
  private initialized = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private stateService: FlowStateService,
    private layoutService: FlowLayoutService
  ) {}

  // ── Lifecycle ───────────────────────────────────────────────

  ngOnInit(): void {
    this.initialized = true;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Public Methods ──────────────────────────────────────────

  /** Fit all nodes within the viewport */
  ZoomToFit(): void {
    this.fCanvas?.fitToScreen({ x: 50, y: 50 }, true);
  }

  /** Zoom in one step */
  ZoomIn(): void {
    if (this.fZoom) {
      this.fZoom.zoomIn();
    } else {
      const newScale = Math.min(this.canvasScale + 0.15, 3);
      this.fCanvas?.setScale(newScale);
      this.updateZoomLevel(newScale);
    }
  }

  /** Zoom out one step */
  ZoomOut(): void {
    if (this.fZoom) {
      this.fZoom.zoomOut();
    } else {
      const newScale = Math.max(this.canvasScale - 0.15, 0.1);
      this.fCanvas?.setScale(newScale);
      this.updateZoomLevel(newScale);
    }
  }

  /** Run auto-layout using dagre */
  AutoArrange(direction?: FlowLayoutDirection): void {
    const dir = direction ?? this.AutoLayoutDirection;
    this.pushUndoState();
    const result = this.layoutService.CalculateLayout(this.Nodes, this.Connections, dir);
    for (const node of this.Nodes) {
      const newPos = result.Positions.get(node.ID);
      if (newPos) {
        node.Position = { ...newPos };
      }
    }
    this.NodesChanged.emit(this.Nodes);
    this.cdr.detectChanges();
    // Fit to screen after layout
    setTimeout(() => this.ZoomToFit(), 100);
  }

  /** Center the canvas on a specific node */
  CenterOnNode(nodeId: string): void {
    this.fCanvas?.centerGroupOrNode(nodeId, true);
  }

  /** Programmatically select a node */
  SelectNode(nodeId: string): void {
    this.fFlow?.select([nodeId], []);
    const node = this.Nodes.find(n => n.ID === nodeId) ?? null;
    this.NodeSelected.emit(node);
  }

  /** Clear all selection */
  ClearSelection(): void {
    this.fFlow?.clearSelection();
    this.selectedNodeIDs = [];
    this.selectedConnectionIDs = [];
    this.NodeSelected.emit(null);
    this.ConnectionSelected.emit(null);
  }

  /** Update a node's visual status */
  SetNodeStatus(nodeId: string, status: FlowNode['Status'], message?: string): void {
    const node = this.Nodes.find(n => n.ID === nodeId);
    if (node) {
      node.Status = status;
      node.StatusMessage = message;
      this.cdr.detectChanges();
    }
  }

  /** Highlight a sequence of nodes (e.g., execution path) */
  HighlightPath(nodeIds: string[]): void {
    for (const node of this.Nodes) {
      if (nodeIds.includes(node.ID)) {
        node.Status = 'running';
      }
    }
    // Highlight connections along the path
    for (const conn of this.Connections) {
      const srcIdx = nodeIds.indexOf(conn.SourceNodeID);
      const tgtIdx = nodeIds.indexOf(conn.TargetNodeID);
      if (srcIdx >= 0 && tgtIdx >= 0 && tgtIdx === srcIdx + 1) {
        conn.Animated = true;
      }
    }
    this.cdr.detectChanges();
  }

  /** Clear all node status highlights */
  ClearHighlights(): void {
    for (const node of this.Nodes) {
      node.Status = 'default';
      node.StatusMessage = undefined;
    }
    for (const conn of this.Connections) {
      conn.Animated = false;
    }
    this.cdr.detectChanges();
  }

  /** Undo the last operation */
  Undo(): void {
    const snapshot = this.stateService.Undo(this.Nodes, this.Connections);
    if (snapshot) {
      this.Nodes = snapshot.Nodes;
      this.Connections = snapshot.Connections;
      this.NodesChanged.emit(this.Nodes);
      this.ConnectionsChanged.emit(this.Connections);
      this.cdr.detectChanges();
    }
  }

  /** Redo the last undone operation */
  Redo(): void {
    const snapshot = this.stateService.Redo(this.Nodes, this.Connections);
    if (snapshot) {
      this.Nodes = snapshot.Nodes;
      this.Connections = snapshot.Connections;
      this.NodesChanged.emit(this.Nodes);
      this.ConnectionsChanged.emit(this.Connections);
      this.cdr.detectChanges();
    }
  }

  get CanUndo(): boolean {
    return this.stateService.CanUndo;
  }

  get CanRedo(): boolean {
    return this.stateService.CanRedo;
  }

  /** Delete the currently selected nodes and connections */
  DeleteSelected(): void {
    if (this.ReadOnly || (this.selectedNodeIDs.length === 0 && this.selectedConnectionIDs.length === 0)) {
      return;
    }
    this.pushUndoState();
    this.removeSelectedItems();
    this.ClearSelection();
  }

  // ── Foblex Event Handlers ──────────────────────────────────

  /** Called when Foblex flow finishes loading */
  protected onFlowLoaded(): void {
    if (this.Nodes.length > 0) {
      setTimeout(() => this.ZoomToFit(), 200);
    }
  }

  /** Canvas zoom/pan changed */
  protected onCanvasChange(event: FCanvasChangeEvent): void {
    this.canvasPosition = event.position;
    this.canvasScale = event.scale;
    this.updateZoomLevel(event.scale);
  }

  /** User drew a new connection */
  protected onCreateConnection(event: FCreateConnectionEvent): void {
    if (!event.fInputId || this.ReadOnly) return;
    this.pushUndoState();

    // Derive node IDs from port IDs (ports are named nodeID-input / nodeID-output)
    const sourceNodeID = this.findNodeByPortId(event.fOutputId);
    const targetNodeID = this.findNodeByPortId(event.fInputId);

    if (!sourceNodeID || !targetNodeID) return;

    // Resolve actual port IDs — when fConnectOnNode is enabled, Foblex may
    // send the node ID itself instead of a port ID. Map to the correct port.
    const sourcePortID = this.resolvePortId(event.fOutputId, sourceNodeID, 'output');
    const targetPortID = this.resolvePortId(event.fInputId, targetNodeID, 'input');

    // Prevent duplicate connections
    const exists = this.Connections.some(
      c => c.SourcePortID === sourcePortID && c.TargetPortID === targetPortID
    );
    if (exists) return;

    this.ConnectionCreated.emit({
      SourceNodeID: sourceNodeID,
      SourcePortID: sourcePortID,
      TargetNodeID: targetNodeID,
      TargetPortID: targetPortID
    });
  }

  /** External item dropped from palette */
  protected onCreateNode(event: FCreateNodeEvent): void {
    if (this.ReadOnly) return;
    this.pushUndoState();

    const nodeType = event.data as string;
    const config = this.NodeTypes.find(nt => nt.Type === nodeType);
    if (!config) return;

    const position = this.fFlow?.getPositionInFlow(event.rect);
    const dropPosition: FlowPosition = position
      ? { X: position.x, Y: position.y }
      : { X: 100, Y: 100 };

    const newNode = this.createDefaultNode(config, dropPosition);
    this.NodeAdded.emit({ Node: newNode, DropPosition: dropPosition });
  }

  /** Selection changed in Foblex */
  protected onSelectionChange(event: FSelectionChangeEvent): void {
    this.selectedNodeIDs = event.fNodeIds ?? [];
    this.selectedConnectionIDs = event.fConnectionIds ?? [];

    this.SelectionChanged.emit({
      SelectedNodeIDs: this.selectedNodeIDs,
      SelectedConnectionIDs: this.selectedConnectionIDs
    });

    // Emit specific node/connection selection events
    if (this.selectedNodeIDs.length === 1) {
      const node = this.Nodes.find(n => n.ID === this.selectedNodeIDs[0]);
      this.NodeSelected.emit(node ?? null);
      this.ConnectionSelected.emit(null);
    } else if (this.selectedConnectionIDs.length === 1) {
      const connId = this.selectedConnectionIDs[0];
      console.log('[FlowEditor] Connection selection event - fConnectionId:', connId);
      console.log('[FlowEditor] Available connections:', this.Connections.map(c => ({ ID: c.ID, Source: c.SourceNodeID })));
      const conn = this.Connections.find(c => c.ID === connId);
      console.log('[FlowEditor] Matched connection:', conn ? conn.ID : 'NULL');
      this.ConnectionSelected.emit(conn ?? null);
      this.NodeSelected.emit(null);
    } else if (this.selectedNodeIDs.length === 0 && this.selectedConnectionIDs.length === 0) {
      this.NodeSelected.emit(null);
      this.ConnectionSelected.emit(null);
    }
  }

  /** Nodes moved on canvas */
  protected onNodesMoved(event: FMoveNodesEvent): void {
    if (this.ReadOnly || !event.fNodes || event.fNodes.length === 0) return;
    this.pushUndoState();

    for (const moved of event.fNodes) {
      const node = this.Nodes.find(n => n.ID === moved.id);
      if (node) {
        const oldPosition = { ...node.Position };
        node.Position = { X: moved.position.x, Y: moved.position.y };
        this.NodeMoved.emit({
          NodeID: node.ID,
          OldPosition: oldPosition,
          NewPosition: node.Position
        });
      }
    }
    this.NodesChanged.emit(this.Nodes);
  }

  // ── Toolbar Event Handlers ─────────────────────────────────

  protected onGridToggled(show: boolean): void {
    this.ShowGrid = show;
    this.cdr.detectChanges();
  }

  protected onMinimapToggled(show: boolean): void {
    this.ShowMinimap = show;
    this.cdr.detectChanges();
  }

  protected onPanModeToggled(enabled: boolean): void {
    this.panMode = enabled;
    this.cdr.detectChanges();
  }

  // ── Context Menu ───────────────────────────────────────────

  protected onNodeContextMenu(event: MouseEvent, node: FlowNode): void {
    if (this.ReadOnly) return;
    event.preventDefault();
    event.stopPropagation();
    this.showContextMenu(event, 'node', node, null);
  }

  protected onConnectionContextMenu(event: MouseEvent, conn: FlowConnection): void {
    if (this.ReadOnly) return;
    event.preventDefault();
    event.stopPropagation();
    this.showContextMenu(event, 'connection', null, conn);
  }

  protected onContextMenuAction(action: FlowContextMenuAction): void {
    this.hideContextMenu();

    if (action === 'edit') {
      if (this.contextMenuTargetType === 'node' && this.contextMenuNode) {
        this.NodeEditRequested.emit(this.contextMenuNode);
      } else if (this.contextMenuTargetType === 'connection' && this.contextMenuConnection) {
        this.ConnectionEditRequested.emit(this.contextMenuConnection);
      }
    } else if (action === 'remove') {
      this.pushUndoState();
      if (this.contextMenuTargetType === 'node' && this.contextMenuNode) {
        this.removeNodeById(this.contextMenuNode.ID);
      } else if (this.contextMenuTargetType === 'connection' && this.contextMenuConnection) {
        this.removeConnectionById(this.contextMenuConnection.ID);
      }
    }
  }

  @HostListener('document:click')
  protected onDocumentClick(): void {
    if (this.contextMenuVisible) {
      this.hideContextMenu();
    }
  }

  private showContextMenu(
    event: MouseEvent,
    targetType: FlowContextMenuTarget,
    node: FlowNode | null,
    connection: FlowConnection | null
  ): void {
    this.contextMenuTargetType = targetType;
    this.contextMenuNode = node;
    this.contextMenuConnection = connection;
    this.contextMenuX = event.clientX;
    this.contextMenuY = event.clientY;
    this.contextMenuVisible = true;
    this.cdr.detectChanges();
  }

  private hideContextMenu(): void {
    this.contextMenuVisible = false;
    this.contextMenuNode = null;
    this.contextMenuConnection = null;
    this.cdr.detectChanges();
  }

  private removeNodeById(nodeId: string): void {
    const node = this.Nodes.find(n => n.ID === nodeId);
    if (!node) return;

    this.Nodes = this.Nodes.filter(n => n.ID !== nodeId);

    /* Remove connections attached to this node */
    const orphaned = this.Connections.filter(
      c => c.SourceNodeID === nodeId || c.TargetNodeID === nodeId
    );
    this.Connections = this.Connections.filter(
      c => c.SourceNodeID !== nodeId && c.TargetNodeID !== nodeId
    );
    for (const conn of orphaned) {
      this.ConnectionRemoved.emit(conn);
    }
    this.NodeRemoved.emit(node);
    this.NodesChanged.emit(this.Nodes);
    this.ConnectionsChanged.emit(this.Connections);
    this.cdr.detectChanges();
  }

  private removeConnectionById(connId: string): void {
    const conn = this.Connections.find(c => c.ID === connId);
    if (!conn) return;

    this.Connections = this.Connections.filter(c => c.ID !== connId);
    this.ConnectionRemoved.emit(conn);
    this.ConnectionsChanged.emit(this.Connections);
    this.cdr.detectChanges();
  }

  // ── Keyboard Shortcuts ─────────────────────────────────────

  @HostListener('keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (this.ReadOnly) return;

    const isCtrlOrMeta = event.ctrlKey || event.metaKey;

    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Don't delete if user is typing in an input
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }
      event.preventDefault();
      this.DeleteSelected();
    } else if (isCtrlOrMeta && event.key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.Undo();
    } else if (isCtrlOrMeta && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
      event.preventDefault();
      this.Redo();
    } else if (isCtrlOrMeta && event.key === 'a') {
      event.preventDefault();
      this.fFlow?.selectAll();
    }
  }

  // ── TrackBy Functions ───────────────────────────────────────

  protected trackNodeById(_index: number, node: FlowNode): string {
    return node.ID;
  }

  protected trackConnectionById(_index: number, conn: FlowConnection): string {
    return conn.ID;
  }

  // ── Helper Methods ─────────────────────────────────────────

  GetTypeConfig(type: string): FlowNodeTypeConfig | null {
    return this.NodeTypes.find(nt => nt.Type === type) ?? null;
  }

  /** Get the connectable side string for Foblex based on port side */
  GetConnectableSide(side: string | undefined): string {
    switch (side) {
      case 'left': return 'left';
      case 'right': return 'right';
      case 'top': return 'top';
      case 'bottom': return 'bottom';
      default: return 'auto';
    }
  }

  get selectedCount(): number {
    return this.selectedNodeIDs.length + this.selectedConnectionIDs.length;
  }

  private pushUndoState(): void {
    this.stateService.PushState(this.Nodes, this.Connections);
  }

  private updateZoomLevel(scale: number): void {
    this.zoomLevel = Math.round(scale * 100);
    this.cdr.detectChanges();
  }

  private findNodeByPortId(portId: string): string | null {
    for (const node of this.Nodes) {
      for (const port of node.Ports) {
        if (port.ID === portId) {
          return node.ID;
        }
      }
    }
    // When fConnectOnNode is enabled, Foblex may send the node ID itself
    // instead of a port ID. Check for a direct node ID match as fallback.
    const directMatch = this.Nodes.find(n => n.ID === portId);
    if (directMatch) {
      return directMatch.ID;
    }
    return null;
  }

  /**
   * When fConnectOnNode is enabled, Foblex may send a node ID instead of a port ID.
   * This resolves the raw ID to the correct port ID for the given direction.
   */
  private resolvePortId(rawId: string, nodeId: string, direction: 'input' | 'output'): string {
    const node = this.Nodes.find(n => n.ID === nodeId);
    if (!node) return rawId;

    // If the rawId already matches a port on this node, use it as-is
    const exactPort = node.Ports.find(p => p.ID === rawId);
    if (exactPort) return rawId;

    // Otherwise, find the first port matching the expected direction
    const dirPort = node.Ports.find(p => p.Direction === direction);
    return dirPort ? dirPort.ID : rawId;
  }

  private createDefaultNode(config: FlowNodeTypeConfig, position: FlowPosition): FlowNode {
    const id = this.generateId();
    const defaultPorts = config.DefaultPorts ?? [
      { ID: `${id}-input`, Direction: 'input' as const, Side: 'top' as const, Multiple: true },
      { ID: `${id}-output`, Direction: 'output' as const, Side: 'bottom' as const, Multiple: true }
    ];

    return {
      ID: id,
      Type: config.Type,
      Label: config.Label,
      Icon: config.Icon,
      Status: 'default',
      Position: position,
      Ports: defaultPorts.map(p => ({
        ...p,
        ID: p.ID.startsWith(id) ? p.ID : `${id}-${p.ID}`
      }))
    };
  }

  private removeSelectedItems(): void {
    // Remove selected connections
    const removedConnections = this.Connections.filter(c => this.selectedConnectionIDs.includes(c.ID));
    this.Connections = this.Connections.filter(c => !this.selectedConnectionIDs.includes(c.ID));
    for (const conn of removedConnections) {
      this.ConnectionRemoved.emit(conn);
    }

    // Remove selected nodes and their connections
    const removedNodes = this.Nodes.filter(n => this.selectedNodeIDs.includes(n.ID));
    this.Nodes = this.Nodes.filter(n => !this.selectedNodeIDs.includes(n.ID));

    // Also remove connections attached to deleted nodes
    const deletedNodeIDs = new Set(this.selectedNodeIDs);
    const orphanedConnections = this.Connections.filter(
      c => deletedNodeIDs.has(c.SourceNodeID) || deletedNodeIDs.has(c.TargetNodeID)
    );
    this.Connections = this.Connections.filter(
      c => !deletedNodeIDs.has(c.SourceNodeID) && !deletedNodeIDs.has(c.TargetNodeID)
    );

    for (const conn of orphanedConnections) {
      this.ConnectionRemoved.emit(conn);
    }
    for (const node of removedNodes) {
      this.NodeRemoved.emit(node);
    }

    this.NodesChanged.emit(this.Nodes);
    this.ConnectionsChanged.emit(this.Connections);
    this.cdr.detectChanges();
  }

  private generateId(): string {
    return 'flow-' + Math.random().toString(36).substring(2, 11);
  }
}
