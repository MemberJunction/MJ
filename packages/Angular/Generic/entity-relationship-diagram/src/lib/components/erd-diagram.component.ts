import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import * as d3 from 'd3';
import {
  ERDNode,
  ERDField,
  ERDLink,
  ERDConfig,
  ERDNodeClickEvent,
  ERDNodeDoubleClickEvent,
  ERDLinkClickEvent,
  ERDZoomEvent,
  ERDColorScheme,
  ERDState,
  ERDNodeHoverEvent,
  ERDLinkHoverEvent,
  ERDNodeContextMenuEvent,
  ERDLinkContextMenuEvent,
  ERDDiagramContextMenuEvent,
  ERDNodeDragEvent,
  ERDRelationshipInfo,
  ERDLayoutAlgorithm,
  ERDDagreConfig
} from '../interfaces/erd-types';
import * as dagre from '@dagrejs/dagre';

/**
 * Internal node representation for D3 force simulation.
 * Extends ERDNode with position and simulation-specific properties.
 * @internal
 */
interface InternalNode {
  id: string;
  name: string;
  node: ERDNode;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  width: number;
  height: number;
  primaryKeys: ERDField[];
  foreignKeys: ERDField[];
}

/**
 * Internal link representation for D3 force simulation.
 * @internal
 */
interface InternalLink {
  source: string | InternalNode;
  target: string | InternalNode;
  sourceField: ERDField;
  targetField?: ERDField;
  isSelfReference: boolean;
  /** Edge points computed by dagre for orthogonal routing */
  points?: Array<{ x: number; y: number }>;
}

/**
 * Default configuration values for the ERD diagram.
 * These values provide a good starting point for most use cases.
 */
/** Default dagre configuration */
const DEFAULT_DAGRE_CONFIG: Required<ERDDagreConfig> = {
  rankDir: 'LR',
  nodeSep: 80,      // Increased from 50 - more vertical space between nodes in same rank
  rankSep: 150,     // Increased from 100 - more horizontal space between ranks for labels
  edgeSep: 20,      // Increased from 10 - more space between edge paths
  ranker: 'network-simplex',
  align: undefined as unknown as 'UL' | 'UR' | 'DL' | 'DR'
};

const DEFAULT_CONFIG: Required<ERDConfig> = {
  nodeWidth: 180,
  nodeBaseHeight: 60,
  fieldHeight: 20,
  maxNodeHeight: 300,
  chargeStrength: -800,
  linkDistance: 80,
  collisionPadding: 20,
  showFieldDetails: true,
  showRelationshipLabels: true,
  showHeader: true,
  showNodeCount: true,
  showMinimap: false,
  showLegend: false,
  enableDragging: true,
  enableZoom: true,
  enablePan: true,
  minZoom: 0.1,
  maxZoom: 4,
  initialZoom: 1,
  enableMultiSelect: false,
  animationDuration: 750,
  fitOnLoad: true,
  skipAnimation: false,
  emptyStateMessage: 'No entities to display',
  emptyStateIcon: 'fa-solid fa-diagram-project',
  layoutAlgorithm: 'dagre',
  dagreConfig: DEFAULT_DAGRE_CONFIG,
  colors: {
    nodeBackground: '#f8f9fa',
    nodeBorder: '#333',
    nodeHeader: '#007bff',
    nodeHeaderText: 'white',
    primaryKeyBackground: '#fff3cd',
    primaryKeyText: '#856404',
    foreignKeyBackground: '#cce5ff',
    foreignKeyText: '#004085',
    linkColor: '#666',
    selectedBorder: '#4CAF50',
    highlightBorder: '#ff9800',
    relatedBorder: '#ff6b35'
  }
};

/**
 * Entity Relationship Diagram component using D3.js force-directed graph.
 *
 * This is a **generic, reusable Angular component** that can visualize any data
 * that conforms to the `ERDNode` interface. It is completely decoupled from
 * MemberJunction-specific types and can be used in any Angular project.
 *
 * ## Features
 *
 * - **Interactive Force-Directed Layout**: Nodes automatically arrange themselves
 *   using physics-based simulation with customizable forces
 * - **Zoom and Pan**: Mouse wheel zoom and drag-to-pan with configurable limits
 * - **Node Selection**: Click to select nodes with visual highlighting
 * - **Focus Mode**: Show a single node with its N-hop related entities
 * - **Relationship Visualization**: Arrows show foreign key relationships
 * - **Customizable Styling**: Full control over colors, sizes, and appearance
 * - **Rich Event System**: Comprehensive events for integration with parent components
 * - **State Persistence**: Save and restore diagram state (zoom, pan, selection, positions)
 *
 * ## Basic Usage
 *
 * ```html
 * <mj-erd-diagram
 *   [nodes]="entityNodes"
 *   [selectedNodeId]="selectedId"
 *   [config]="erdConfig"
 *   (nodeClick)="onNodeClick($event)"
 *   (nodeSelected)="onNodeSelected($event)"
 *   (zoomChange)="onZoomChange($event)">
 * </mj-erd-diagram>
 * ```
 *
 * ## Focus Mode Example
 *
 * Show a single entity with its immediate relationships:
 *
 * ```html
 * <mj-erd-diagram
 *   [nodes]="allNodes"
 *   [focusNodeId]="'user-entity-id'"
 *   [focusDepth]="1"
 *   (nodeSelected)="onNodeSelected($event)">
 * </mj-erd-diagram>
 * ```
 *
 * ## State Persistence Example
 *
 * ```typescript
 * // Save state
 * const state = this.erdDiagram.getState();
 * localStorage.setItem('erd-state', JSON.stringify(state));
 *
 * // Restore state
 * const savedState = JSON.parse(localStorage.getItem('erd-state'));
 * this.erdDiagram.setState(savedState);
 * ```
 *
 * @see ERDNode for the node data structure
 * @see ERDConfig for configuration options
 * @see ERDState for state persistence
 */
@Component({
  selector: 'mj-erd-diagram',
  templateUrl: './erd-diagram.component.html',
  styleUrls: ['./erd-diagram.component.css']
})
export class ERDDiagramComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('erdContainer', { static: false }) erdContainer!: ElementRef;

  // ============================================================================
  // INPUTS - Data
  // ============================================================================

  /**
   * The nodes (entities) to display in the diagram.
   * Each node should conform to the `ERDNode` interface.
   *
   * @example
   * ```typescript
   * nodes: ERDNode[] = [
   *   {
   *     id: 'user-1',
   *     name: 'Users',
   *     fields: [
   *       { id: 'id', name: 'ID', isPrimaryKey: true },
   *       { id: 'email', name: 'Email', isPrimaryKey: false }
   *     ]
   *   }
   * ];
   * ```
   */
  @Input() nodes: ERDNode[] = [];

  /**
   * ID of the currently selected node.
   * Use this for external control of selection state.
   * The component will highlight this node and emit selection events accordingly.
   *
   * @example `[selectedNodeId]="'entity-123'"`
   */
  @Input() selectedNodeId: string | null = null;

  /**
   * IDs of nodes to highlight (in addition to selected node).
   * Highlighted nodes receive a distinct visual style (orange border by default).
   * Useful for showing search results or related items.
   *
   * @example `[highlightedNodeIds]="['entity-1', 'entity-2']"`
   */
  @Input() highlightedNodeIds: string[] = [];

  /**
   * ID of the node to focus on.
   * When set, the diagram will only show this node and its related nodes
   * up to `focusDepth` hops away. This is useful for entity-centric views.
   *
   * Set to `null` to show all nodes.
   *
   * @example `[focusNodeId]="'user-entity-id'"`
   */
  @Input() focusNodeId: string | null = null;

  /**
   * Number of relationship hops to include when in focus mode.
   * - `0`: Show only the focus node
   * - `1`: Show focus node + directly related nodes
   * - `2`: Show focus node + nodes within 2 relationship hops
   *
   * Only applies when `focusNodeId` is set.
   *
   * @default 1
   * @example `[focusDepth]="2"`
   */
  @Input() focusDepth = 1;

  // ============================================================================
  // INPUTS - State
  // ============================================================================

  /**
   * Whether the diagram is currently refreshing/loading.
   * When `true`, displays a loading overlay on the diagram.
   *
   * @example `[isRefreshing]="isLoadingData"`
   */
  @Input() isRefreshing = false;

  /**
   * Whether the diagram is in read-only mode.
   * When `true`, disables dragging and selection (zoom/pan still work).
   *
   * @default false
   */
  @Input() readOnly = false;

  // ============================================================================
  // INPUTS - Configuration
  // ============================================================================

  /**
   * Configuration options for the diagram.
   * All options are optional with sensible defaults.
   *
   * @see ERDConfig for all available options
   * @example
   * ```typescript
   * config: ERDConfig = {
   *   nodeWidth: 200,
   *   chargeStrength: -1000,
   *   colors: {
   *     nodeHeader: '#0066cc'
   *   }
   * };
   * ```
   */
  @Input() config: ERDConfig = {};

  /**
   * Whether to show the header bar with zoom controls.
   * Set to `false` to hide the header and use programmatic control instead.
   *
   * @default true
   */
  @Input() showHeader = true;

  /**
   * Title to display in the header bar.
   * Only visible when `showHeader` is `true`.
   *
   * @default 'Entity Relationship Diagram'
   */
  @Input() headerTitle = 'Entity Relationship Diagram';

  // ============================================================================
  // OUTPUTS - Selection Events
  // ============================================================================

  /**
   * Emitted when a node is clicked.
   * Set `event.cancel = true` to prevent the default selection behavior.
   *
   * @example
   * ```typescript
   * onNodeClick(event: ERDNodeClickEvent) {
   *   console.log('Clicked:', event.node.name);
   *   // Prevent selection for certain nodes
   *   if (event.node.customData?.['locked']) {
   *     event.cancel = true;
   *   }
   * }
   * ```
   */
  @Output() nodeClick = new EventEmitter<ERDNodeClickEvent>();

  /**
   * Emitted when a node is double-clicked.
   * Useful for opening detail views or triggering actions.
   *
   * @example
   * ```typescript
   * onNodeDoubleClick(event: ERDNodeDoubleClickEvent) {
   *   this.openEntityDetail(event.node.id);
   * }
   * ```
   */
  @Output() nodeDoubleClick = new EventEmitter<ERDNodeDoubleClickEvent>();

  /**
   * Emitted when a node is selected (after click, unless cancelled).
   * The node parameter contains the full `ERDNode` data.
   */
  @Output() nodeSelected = new EventEmitter<ERDNode>();

  /**
   * Emitted when the current node is deselected.
   * This happens when clicking the background or selecting a different node.
   */
  @Output() nodeDeselected = new EventEmitter<void>();

  /**
   * Emitted when a relationship link is clicked.
   * The event includes both source and target nodes for context.
   */
  @Output() linkClick = new EventEmitter<ERDLinkClickEvent>();

  // ============================================================================
  // OUTPUTS - Hover Events
  // ============================================================================

  /**
   * Emitted when the mouse enters a node.
   * Includes related nodes and position for tooltip display.
   *
   * @example
   * ```typescript
   * onNodeHover(event: ERDNodeHoverEvent) {
   *   this.showTooltip(event.node, event.position);
   * }
   * ```
   */
  @Output() nodeHover = new EventEmitter<ERDNodeHoverEvent>();

  /**
   * Emitted when the mouse leaves a node.
   */
  @Output() nodeHoverEnd = new EventEmitter<ERDNode>();

  /**
   * Emitted when the mouse enters a relationship link.
   */
  @Output() linkHover = new EventEmitter<ERDLinkHoverEvent>();

  /**
   * Emitted when the mouse leaves a relationship link.
   */
  @Output() linkHoverEnd = new EventEmitter<ERDLink>();

  // ============================================================================
  // OUTPUTS - Context Menu Events
  // ============================================================================

  /**
   * Emitted when a node is right-clicked.
   * Set `event.cancel = true` to prevent the default browser context menu.
   *
   * @example
   * ```typescript
   * onNodeContextMenu(event: ERDNodeContextMenuEvent) {
   *   event.cancel = true;
   *   this.showContextMenu(event.node, event.position);
   * }
   * ```
   */
  @Output() nodeContextMenu = new EventEmitter<ERDNodeContextMenuEvent>();

  /**
   * Emitted when a relationship link is right-clicked.
   */
  @Output() linkContextMenu = new EventEmitter<ERDLinkContextMenuEvent>();

  /**
   * Emitted when the diagram background is right-clicked.
   * Includes diagram coordinates for adding new nodes at click position.
   */
  @Output() diagramContextMenu = new EventEmitter<ERDDiagramContextMenuEvent>();

  // ============================================================================
  // OUTPUTS - Drag Events
  // ============================================================================

  /**
   * Emitted when a node drag operation starts.
   * Set `event.cancel = true` to prevent the drag.
   */
  @Output() nodeDragStart = new EventEmitter<ERDNodeDragEvent>();

  /**
   * Emitted when a node drag operation ends.
   */
  @Output() nodeDragEnd = new EventEmitter<ERDNodeDragEvent>();

  // ============================================================================
  // OUTPUTS - Diagram Events
  // ============================================================================

  /**
   * Emitted when zoom level or pan position changes.
   * Useful for synchronizing zoom controls or saving view state.
   */
  @Output() zoomChange = new EventEmitter<ERDZoomEvent>();

  /**
   * Emitted when the diagram requests a refresh.
   * Triggered by the refresh button in the header.
   */
  @Output() refreshRequested = new EventEmitter<void>();

  /**
   * Emitted when the force simulation completes initial layout.
   * Useful for performing actions after nodes have settled.
   */
  @Output() layoutComplete = new EventEmitter<void>();

  /**
   * Emitted when diagram state changes (selection, zoom, highlights).
   * Useful for auto-saving state or syncing with other components.
   */
  @Output() stateChange = new EventEmitter<ERDState>();

  // ============================================================================
  // PRIVATE STATE
  // ============================================================================

  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
  private simulation: d3.Simulation<InternalNode, InternalLink> | null = null;
  private internalNodes: InternalNode[] = [];
  private internalLinks: InternalLink[] = [];
  private visibleNodes: InternalNode[] = [];
  private visibleLinks: InternalLink[] = [];
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private resizeObserver?: ResizeObserver;
  private lastKnownSize = { width: 0, height: 0 };
  private resizeTimeout?: number;
  private mergedConfig: Required<ERDConfig> = DEFAULT_CONFIG;
  private layoutCompleted = false;
  private isLayoutFrozen = false;

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.setupERD();
    }, 100);

    this.setupResizeObserver();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['nodes'] && !changes['nodes'].firstChange) {
      this.setupERD();
    }

    if (changes['selectedNodeId'] && !changes['selectedNodeId'].firstChange) {
      this.updateSelectionHighlighting();
      this.emitStateChange();
    }

    if (changes['highlightedNodeIds'] && !changes['highlightedNodeIds'].firstChange) {
      this.updateHighlighting();
      this.emitStateChange();
    }

    if (changes['focusNodeId'] && !changes['focusNodeId'].firstChange) {
      this.setupERD();
      this.emitStateChange();
    }

    if (changes['focusDepth'] && !changes['focusDepth'].firstChange) {
      if (this.focusNodeId) {
        this.setupERD();
        this.emitStateChange();
      }
    }

    if (changes['config'] && !changes['config'].firstChange) {
      this.mergeConfig();
      this.setupERD();
    }
  }

  ngOnDestroy(): void {
    if (this.simulation) {
      this.simulation.stop();
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
  }

  // ============================================================================
  // PUBLIC API - Zoom Control
  // ============================================================================

  /**
   * Zoom in on the diagram by a fixed factor (1.2x).
   * Uses smooth animation transition.
   */
  public zoomIn(): void {
    if (this.zoom && this.svg) {
      this.svg.transition().duration(300).call(
        this.zoom.scaleBy as unknown as (transition: d3.Transition<SVGSVGElement, unknown, null, undefined>, k: number) => void,
        1.2
      );
    }
  }

  /**
   * Zoom out on the diagram by a fixed factor (0.83x).
   * Uses smooth animation transition.
   */
  public zoomOut(): void {
    if (this.zoom && this.svg) {
      this.svg.transition().duration(300).call(
        this.zoom.scaleBy as unknown as (transition: d3.Transition<SVGSVGElement, unknown, null, undefined>, k: number) => void,
        0.83
      );
    }
  }

  /**
   * Reset zoom to default level (1x) and center the diagram.
   * Uses smooth animation transition.
   */
  public resetZoom(): void {
    if (this.zoom && this.svg) {
      this.svg.transition().duration(500).call(
        this.zoom.transform as unknown as (transition: d3.Transition<SVGSVGElement, unknown, null, undefined>, transform: d3.ZoomTransform) => void,
        d3.zoomIdentity
      );
    }
  }

  /**
   * Zoom and pan to center on a specific node.
   *
   * @param nodeId - ID of the node to center on
   * @param scale - Optional zoom scale (default: 1.5)
   *
   * @example
   * ```typescript
   * // Center on node with default zoom
   * this.erdDiagram.zoomToNode('user-entity-id');
   *
   * // Center with custom zoom level
   * this.erdDiagram.zoomToNode('user-entity-id', 2.0);
   * ```
   */
  public zoomToNode(nodeId: string, scale = 1.5): void {
    const node = this.internalNodes.find(n => n.id === nodeId);
    if (!node || !this.zoom || !this.svg) return;

    const container = this.erdContainer.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const x = width / 2 - (node.x || 0) * scale;
    const y = height / 2 - (node.y || 0) * scale;

    this.svg.transition().duration(this.mergedConfig.animationDuration).call(
      this.zoom.transform as unknown as (transition: d3.Transition<SVGSVGElement, unknown, null, undefined>, transform: d3.ZoomTransform) => void,
      d3.zoomIdentity.translate(x, y).scale(scale)
    );
  }

  /**
   * Fit all visible nodes within the viewport.
   * Calculates optimal zoom level and position to show all nodes.
   *
   * @param padding - Padding around nodes (default: 50px)
   */
  public zoomToFit(padding = 50): void {
    if (!this.svg || !this.zoom || this.visibleNodes.length === 0) return;

    const container = this.erdContainer.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Guard against zero container dimensions (container not laid out yet)
    if (width === 0 || height === 0) return;

    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.visibleNodes.forEach(node => {
      const halfWidth = node.width / 2;
      const halfHeight = node.height / 2;
      minX = Math.min(minX, (node.x || 0) - halfWidth);
      minY = Math.min(minY, (node.y || 0) - halfHeight);
      maxX = Math.max(maxX, (node.x || 0) + halfWidth);
      maxY = Math.max(maxY, (node.y || 0) + halfHeight);
    });

    // Guard against invalid bounds (nodes without valid positions)
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;

    const boundsWidth = maxX - minX + padding * 2;
    const boundsHeight = maxY - minY + padding * 2;

    // Guard against zero-dimension bounds
    if (boundsWidth <= 0 || boundsHeight <= 0) return;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const scale = Math.min(
      width / boundsWidth,
      height / boundsHeight,
      this.mergedConfig.maxZoom
    );

    // Final sanity check before applying transform
    if (!isFinite(scale) || scale <= 0) return;

    const translateX = width / 2 - centerX * scale;
    const translateY = height / 2 - centerY * scale;

    this.svg.transition().duration(this.mergedConfig.animationDuration).call(
      this.zoom.transform as unknown as (transition: d3.Transition<SVGSVGElement, unknown, null, undefined>, transform: d3.ZoomTransform) => void,
      d3.zoomIdentity.translate(translateX, translateY).scale(scale)
    );
  }

  // ============================================================================
  // PUBLIC API - Selection
  // ============================================================================

  /**
   * Programmatically select a node by ID.
   *
   * @param nodeId - ID of the node to select
   * @returns `true` if node was found and selected, `false` otherwise
   */
  public selectNode(nodeId: string): boolean {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) {
      this.nodeSelected.emit(node);
      return true;
    }
    return false;
  }

  /**
   * Clear all selections.
   */
  public deselectAll(): void {
    this.nodeDeselected.emit();
    this.clearAllHighlighting();
  }

  // ============================================================================
  // PUBLIC API - Highlighting
  // ============================================================================

  /**
   * Highlight a specific node.
   *
   * @param nodeId - ID of the node to highlight
   */
  public highlightNode(nodeId: string): void {
    if (!this.highlightedNodeIds.includes(nodeId)) {
      this.highlightedNodeIds = [...this.highlightedNodeIds, nodeId];
      this.updateHighlighting();
      this.emitStateChange();
    }
  }

  /**
   * Clear all highlights.
   */
  public clearHighlights(): void {
    this.highlightedNodeIds = [];
    this.updateHighlighting();
    this.emitStateChange();
  }

  /**
   * Highlight a node and all its directly related nodes.
   *
   * @param nodeId - ID of the center node
   * @param depth - Number of relationship hops to highlight (default: 1)
   */
  public highlightRelated(nodeId: string, depth = 1): void {
    const relatedIds = this.getRelatedNodeIds(nodeId, depth);
    this.highlightedNodeIds = [nodeId, ...relatedIds];
    this.updateHighlighting();
    this.emitStateChange();
  }

  /**
   * Get nodes that are related to a specific node.
   *
   * @param nodeId - ID of the node to find relationships for
   * @param depth - Number of relationship hops (default: 1)
   * @returns Array of relationship information
   */
  public getRelatedNodes(nodeId: string, depth = 1): ERDRelationshipInfo[] {
    const result: ERDRelationshipInfo[] = [];
    const visited = new Set<string>([nodeId]);
    const toProcess = [{ id: nodeId, currentDepth: 0 }];

    while (toProcess.length > 0) {
      const current = toProcess.shift()!;
      if (current.currentDepth >= depth) continue;

      // Find outgoing relationships
      this.nodes.forEach(node => {
        node.fields.forEach(field => {
          if (field.relatedNodeId) {
            if (node.id === current.id && !visited.has(field.relatedNodeId)) {
              const targetNode = this.nodes.find(n => n.id === field.relatedNodeId);
              if (targetNode) {
                visited.add(field.relatedNodeId);
                toProcess.push({ id: field.relatedNodeId, currentDepth: current.currentDepth + 1 });
                result.push({
                  node: targetNode,
                  link: {
                    sourceNodeId: node.id,
                    targetNodeId: field.relatedNodeId,
                    sourceField: field,
                    isSelfReference: node.id === field.relatedNodeId
                  },
                  direction: 'outgoing',
                  field
                });
              }
            }
            // Incoming relationships
            if (field.relatedNodeId === current.id && !visited.has(node.id)) {
              visited.add(node.id);
              toProcess.push({ id: node.id, currentDepth: current.currentDepth + 1 });
              result.push({
                node,
                link: {
                  sourceNodeId: node.id,
                  targetNodeId: field.relatedNodeId,
                  sourceField: field,
                  isSelfReference: node.id === field.relatedNodeId
                },
                direction: 'incoming',
                field
              });
            }
          }
        });
      });
    }

    return result;
  }

  // ============================================================================
  // PUBLIC API - State Management
  // ============================================================================

  /**
   * Get the current state of the diagram for persistence.
   * Includes selection, highlights, zoom, pan, and node positions.
   *
   * @returns Current diagram state
   *
   * @example
   * ```typescript
   * // Save to localStorage
   * const state = erdDiagram.getState();
   * localStorage.setItem('erd-state', JSON.stringify(state));
   * ```
   */
  public getState(): ERDState {
    const zoomState = this.getZoomState();
    const nodePositions: Record<string, { x: number; y: number; fx?: number | null; fy?: number | null }> = {};

    this.internalNodes.forEach(node => {
      nodePositions[node.id] = {
        x: node.x || 0,
        y: node.y || 0,
        fx: node.fx,
        fy: node.fy
      };
    });

    return {
      selectedNodeId: this.selectedNodeId,
      highlightedNodeIds: [...this.highlightedNodeIds],
      zoomLevel: zoomState.zoomLevel,
      translateX: zoomState.translateX,
      translateY: zoomState.translateY,
      focusNodeId: this.focusNodeId,
      focusDepth: this.focusDepth,
      nodePositions
    };
  }

  /**
   * Restore a previously saved diagram state.
   *
   * @param state - State object from `getState()`
   * @param restorePositions - Whether to restore node positions (default: true)
   *
   * @example
   * ```typescript
   * // Restore from localStorage
   * const savedState = JSON.parse(localStorage.getItem('erd-state'));
   * if (savedState) {
   *   erdDiagram.setState(savedState);
   * }
   * ```
   */
  public setState(state: Partial<ERDState>, restorePositions = true): void {
    if (state.highlightedNodeIds) {
      this.highlightedNodeIds = [...state.highlightedNodeIds];
    }

    // Restore zoom/pan
    if (this.svg && this.zoom && state.zoomLevel != null) {
      this.svg.call(
        this.zoom.transform as unknown as (selection: d3.Selection<SVGSVGElement, unknown, null, undefined>, transform: d3.ZoomTransform) => void,
        d3.zoomIdentity
          .translate(state.translateX || 0, state.translateY || 0)
          .scale(state.zoomLevel)
      );
    }

    // Restore node positions
    if (restorePositions && state.nodePositions) {
      this.internalNodes.forEach(node => {
        const savedPos = state.nodePositions?.[node.id];
        if (savedPos) {
          node.x = savedPos.x;
          node.y = savedPos.y;
          node.fx = savedPos.fx;
          node.fy = savedPos.fy;
        }
      });

      // Restart simulation briefly to update display
      if (this.simulation) {
        this.simulation.alpha(0.1).restart();
      }
    }

    this.updateSelectionHighlighting();
    this.updateHighlighting();
  }

  // ============================================================================
  // PUBLIC API - Layout Control
  // ============================================================================

  /**
   * Freeze the layout simulation.
   * Nodes will stay in their current positions and won't move.
   */
  public freezeLayout(): void {
    this.isLayoutFrozen = true;
    if (this.simulation) {
      this.simulation.stop();
      // Fix all node positions
      this.internalNodes.forEach(node => {
        node.fx = node.x;
        node.fy = node.y;
      });
    }
  }

  /**
   * Unfreeze the layout simulation.
   * Nodes will resume natural movement based on forces.
   */
  public unfreezeLayout(): void {
    this.isLayoutFrozen = false;
    // Unfix all node positions
    this.internalNodes.forEach(node => {
      node.fx = null;
      node.fy = null;
    });
    if (this.simulation) {
      this.simulation.alpha(0.3).restart();
    }
  }

  /**
   * Center the diagram without changing zoom level.
   */
  public centerDiagram(): void {
    if (!this.svg || !this.zoom || this.visibleNodes.length === 0) return;

    const container = this.erdContainer.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Calculate center of all nodes
    let sumX = 0, sumY = 0;
    this.visibleNodes.forEach(node => {
      sumX += node.x || 0;
      sumY += node.y || 0;
    });
    const centerX = sumX / this.visibleNodes.length;
    const centerY = sumY / this.visibleNodes.length;

    const currentTransform = d3.zoomTransform(this.svg.node()!);
    const translateX = width / 2 - centerX * currentTransform.k;
    const translateY = height / 2 - centerY * currentTransform.k;

    this.svg.transition().duration(this.mergedConfig.animationDuration).call(
      this.zoom.transform as unknown as (transition: d3.Transition<SVGSVGElement, unknown, null, undefined>, transform: d3.ZoomTransform) => void,
      d3.zoomIdentity.translate(translateX, translateY).scale(currentTransform.k)
    );
  }

  // ============================================================================
  // PUBLIC API - Utilities
  // ============================================================================

  /**
   * Rebuild the entire ERD visualization.
   */
  public refresh(): void {
    this.setupERD();
  }

  /**
   * Trigger a resize recalculation.
   * Call this when the container size changes.
   */
  public triggerResize(): void {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }

    this.resizeTimeout = window.setTimeout(() => {
      this.resizeSVG();
    }, 100);
  }

  /**
   * Get current zoom state.
   *
   * @returns Current zoom level and translation
   */
  public getZoomState(): ERDZoomEvent {
    if (!this.svg) {
      return { zoomLevel: 1, translateX: 0, translateY: 0 };
    }
    const transform = d3.zoomTransform(this.svg.node()!);
    return {
      zoomLevel: transform.k,
      translateX: transform.x,
      translateY: transform.y
    };
  }

  /**
   * Export the diagram as an SVG string.
   *
   * @returns SVG markup string
   */
  public exportAsSVG(): string {
    if (!this.svg) return '';

    const svgNode = this.svg.node();
    if (!svgNode) return '';

    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgNode);
  }

  // ============================================================================
  // SETUP METHODS
  // ============================================================================

  private setupERD(): void {
    if (!this.erdContainer?.nativeElement) {
      return;
    }

    this.layoutCompleted = false;
    this.mergeConfig();
    this.clearVisualization();
    this.createInternalNodes();
    this.createInternalLinks();
    this.applyFocusMode();
    this.createVisualization();
  }

  private mergeConfig(): void {
    this.mergedConfig = {
      ...DEFAULT_CONFIG,
      ...this.config,
      colors: {
        ...DEFAULT_CONFIG.colors,
        ...this.config.colors
      },
      dagreConfig: {
        ...DEFAULT_DAGRE_CONFIG,
        ...this.config.dagreConfig
      }
    };

    // Map 'horizontal' and 'vertical' layout algorithms to dagre with appropriate direction
    if (this.mergedConfig.layoutAlgorithm === 'horizontal') {
      this.mergedConfig.dagreConfig.rankDir = 'LR';
    } else if (this.mergedConfig.layoutAlgorithm === 'vertical') {
      this.mergedConfig.dagreConfig.rankDir = 'TB';
    }
  }

  private resizeSVG(): void {
    if (!this.svg || !this.erdContainer?.nativeElement) {
      return;
    }

    const container = this.erdContainer.nativeElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    if (Math.abs(this.lastKnownSize.width - width) < 5 &&
        Math.abs(this.lastKnownSize.height - height) < 5) {
      return;
    }

    this.lastKnownSize = { width, height };

    const svgElement = this.svg.node();
    if (svgElement) {
      svgElement.style.width = '100%';
      svgElement.style.height = '100%';
    }

    this.svg.attr('viewBox', `0 0 ${width} ${height}`);

    if (this.simulation && !this.isLayoutFrozen) {
      this.simulation.force('center', d3.forceCenter(width / 2, height / 2));
      this.simulation.alpha(0.3).restart();
    }
  }

  private setupResizeObserver(): void {
    if (!this.erdContainer?.nativeElement) {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }

      this.resizeTimeout = window.setTimeout(() => {
        const container = this.erdContainer?.nativeElement;
        if (!container) return;

        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;

        if (Math.abs(this.lastKnownSize.width - newWidth) >= 5 ||
            Math.abs(this.lastKnownSize.height - newHeight) >= 5) {
          requestAnimationFrame(() => {
            this.resizeSVG();
          });
        }
      }, 50);
    });

    this.resizeObserver.observe(this.erdContainer.nativeElement);
  }

  private clearVisualization(): void {
    if (this.simulation) {
      this.simulation.stop();
    }
    d3.select(this.erdContainer.nativeElement).selectAll('*').remove();
  }

  // ============================================================================
  // FOCUS MODE
  // ============================================================================

  private applyFocusMode(): void {
    if (!this.focusNodeId) {
      // No focus mode - show all nodes
      this.visibleNodes = [...this.internalNodes];
      this.visibleLinks = [...this.internalLinks];
      return;
    }

    // Get IDs of nodes within focus depth
    const visibleIds = new Set<string>([this.focusNodeId]);
    const relatedIds = this.getRelatedNodeIds(this.focusNodeId, this.focusDepth);
    relatedIds.forEach(id => visibleIds.add(id));

    // Filter nodes
    this.visibleNodes = this.internalNodes.filter(n => visibleIds.has(n.id));

    // Filter links - only show links between visible nodes
    this.visibleLinks = this.internalLinks.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      return visibleIds.has(sourceId) && visibleIds.has(targetId);
    });
  }

  private getRelatedNodeIds(nodeId: string, depth: number): string[] {
    const visited = new Set<string>([nodeId]);
    const toProcess = [{ id: nodeId, currentDepth: 0 }];
    const result: string[] = [];

    while (toProcess.length > 0) {
      const current = toProcess.shift()!;
      if (current.currentDepth >= depth) continue;

      // Find relationships
      this.nodes.forEach(node => {
        node.fields.forEach(field => {
          if (field.relatedNodeId) {
            // Outgoing from current
            if (node.id === current.id && !visited.has(field.relatedNodeId)) {
              visited.add(field.relatedNodeId);
              result.push(field.relatedNodeId);
              toProcess.push({ id: field.relatedNodeId, currentDepth: current.currentDepth + 1 });
            }
            // Incoming to current
            if (field.relatedNodeId === current.id && !visited.has(node.id)) {
              visited.add(node.id);
              result.push(node.id);
              toProcess.push({ id: node.id, currentDepth: current.currentDepth + 1 });
            }
          }
        });
      });
    }

    return result;
  }

  // ============================================================================
  // NODE/LINK CREATION
  // ============================================================================

  private createInternalNodes(): void {
    const cfg = this.mergedConfig;

    this.internalNodes = this.nodes.map(node => {
      const primaryKeys = node.fields.filter(f => f.isPrimaryKey);
      const foreignKeys = node.fields.filter(f => f.relatedNodeId && !f.isPrimaryKey);

      const fieldCount = Math.max(1, primaryKeys.length + foreignKeys.length);
      const calculatedHeight = Math.min(
        cfg.nodeBaseHeight + (fieldCount * cfg.fieldHeight),
        cfg.maxNodeHeight
      );

      return {
        id: node.id,
        name: node.name || node.schemaName || 'Unknown',
        node: node,
        width: cfg.nodeWidth,
        height: calculatedHeight,
        primaryKeys: primaryKeys,
        foreignKeys: foreignKeys
      };
    });
  }

  private createInternalLinks(): void {
    this.internalLinks = [];
    const nodeMap = new Map(this.internalNodes.map(n => [n.id, n]));

    this.nodes.forEach(node => {
      node.fields.forEach(field => {
        if (field.relatedNodeId && !field.isPrimaryKey) {
          const sourceNode = nodeMap.get(node.id);
          const targetNode = nodeMap.get(field.relatedNodeId);

          if (sourceNode && targetNode) {
            const isSelfReference = node.id === field.relatedNodeId;
            const targetField = targetNode.primaryKeys.find(pk => pk.name === field.relatedFieldName);

            this.internalLinks.push({
              source: sourceNode,
              target: targetNode,
              sourceField: field,
              targetField: targetField,
              isSelfReference: isSelfReference
            });
          }
        }
      });
    });
  }

  // ============================================================================
  // DAGRE LAYOUT
  // ============================================================================

  /**
   * Applies dagre hierarchical layout to position nodes and compute edge paths.
   * This provides clean, orthogonal edge routing.
   */
  private applyDagreLayout(): void {
    const cfg = this.mergedConfig;
    const dagreCfg = cfg.dagreConfig as Required<ERDDagreConfig>;

    // Create a new directed graph
    const g = new dagre.graphlib.Graph({ directed: true, multigraph: true });

    // Set graph options
    g.setGraph({
      rankdir: dagreCfg.rankDir,
      nodesep: dagreCfg.nodeSep,
      ranksep: dagreCfg.rankSep,
      edgesep: dagreCfg.edgeSep,
      ranker: dagreCfg.ranker,
      align: dagreCfg.align
    });

    // Default edge label (required by dagre)
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes to the graph
    this.visibleNodes.forEach(node => {
      g.setNode(node.id, {
        width: node.width,
        height: node.height,
        label: node.name
      });
    });

    // Add edges to the graph
    this.visibleLinks.forEach((link, index) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;

      // Use index as edge name for multigraph support (multiple edges between same nodes)
      g.setEdge(sourceId, targetId, {
        label: link.sourceField.name || '',
        labelpos: 'c',
        labeloffset: 10
      }, `edge-${index}`);
    });

    // Run the layout algorithm
    dagre.layout(g);

    // Apply computed positions to nodes
    this.visibleNodes.forEach(node => {
      const dagreNode = g.node(node.id);
      if (dagreNode) {
        node.x = dagreNode.x;
        node.y = dagreNode.y;
        // Fix position to prevent force simulation from moving nodes
        node.fx = dagreNode.x;
        node.fy = dagreNode.y;
      }
    });

    // Store edge points for orthogonal path rendering
    this.visibleLinks.forEach((link, index) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;

      const edge = g.edge(sourceId, targetId, `edge-${index}`);
      if (edge && edge.points) {
        link.points = edge.points;
      }
    });
  }

  /**
   * Checks if the current layout algorithm uses dagre.
   */
  private usesDagreLayout(): boolean {
    const algo = this.mergedConfig.layoutAlgorithm;
    return algo === 'dagre' || algo === 'horizontal' || algo === 'vertical';
  }

  // ============================================================================
  // VISUALIZATION
  // ============================================================================

  private createVisualization(): void {
    const container = this.erdContainer.nativeElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const cfg = this.mergedConfig;
    const colors = cfg.colors as Required<ERDColorScheme>;

    this.lastKnownSize = { width, height };

    // Create zoom behavior
    if (cfg.enableZoom) {
      this.zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([cfg.minZoom, cfg.maxZoom])
        .on('zoom', (event) => {
          if (this.svg) {
            this.svg.select('.chart-area').attr('transform', event.transform);
            this.zoomChange.emit({
              zoomLevel: event.transform.k,
              translateX: event.transform.x,
              translateY: event.transform.y
            });
          }
        });
    }

    // Create SVG
    this.svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('width', '100%')
      .style('height', '100%')
      .style('position', 'absolute')
      .style('top', '0')
      .style('left', '0');

    if (this.zoom) {
      this.svg.call(this.zoom);
    }

    // Background click handler
    this.svg.on('click', (event: MouseEvent) => {
      if (event.target === event.currentTarget) {
        this.nodeDeselected.emit();
        this.clearAllHighlighting();
      }
    });

    // Background context menu handler
    this.svg.on('contextmenu', (event: MouseEvent) => {
      if (event.target === event.currentTarget) {
        const contextEvent: ERDDiagramContextMenuEvent = {
          mouseEvent: event,
          cancel: false,
          position: { x: event.clientX, y: event.clientY },
          diagramPosition: this.screenToDiagramCoords(event.clientX, event.clientY)
        };
        this.diagramContextMenu.emit(contextEvent);
        if (contextEvent.cancel) {
          event.preventDefault();
        }
      }
    });

    const chartArea = this.svg.append('g').attr('class', 'chart-area');

    // Define arrow marker
    this.svg
      .append('defs')
      .selectAll('marker')
      .data(['end-arrow'])
      .enter()
      .append('marker')
      .attr('id', 'end-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', colors.linkColor);

    // Apply layout based on algorithm
    if (this.usesDagreLayout()) {
      // Use dagre for hierarchical layout with orthogonal edges
      this.applyDagreLayout();
      this.simulation = null; // No force simulation needed
    } else {
      // Create force simulation with visible nodes only (original behavior)
      this.simulation = d3
        .forceSimulation<InternalNode>(this.visibleNodes)
        .force(
          'link',
          d3
            .forceLink<InternalNode, InternalLink>(this.visibleLinks)
            .id((d) => d.id)
            .distance((d) => {
              const source = d.source as InternalNode;
              const target = d.target as InternalNode;
              const sourceSize = Math.max(source.width, source.height);
              const targetSize = Math.max(target.width, target.height);
              return (sourceSize + targetSize) / 2 + cfg.linkDistance;
            })
        )
        .force('charge', d3.forceManyBody().strength(cfg.chargeStrength))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force(
          'collision',
          d3.forceCollide<InternalNode>().radius((d) => {
            return Math.max(d.width, d.height) / 2 + cfg.collisionPadding;
          })
        );
    }

    // Create links
    const link = chartArea
      .selectAll('.link')
      .data(this.visibleLinks)
      .enter()
      .append('g')
      .attr('class', 'link-group');

    link
      .append('path')
      .attr('class', 'link')
      .attr('stroke', colors.linkColor)
      .attr('stroke-opacity', 0.8)
      .attr('stroke-width', 2)
      .attr('fill', 'none')
      .attr('marker-end', (d) => (d.isSelfReference ? 'none' : 'url(#end-arrow)'));

    if (cfg.showRelationshipLabels) {
      // Add background rect for label (will be sized after text is rendered)
      // Self-referencing links get a green background to stand out
      link
        .append('rect')
        .attr('class', 'link-label-bg')
        .attr('fill', (d) => d.isSelfReference ? '#e8f5e9' : 'white')
        .attr('stroke', (d) => d.isSelfReference ? '#4CAF50' : colors.linkColor)
        .attr('stroke-width', 0.5)
        .attr('stroke-opacity', (d) => d.isSelfReference ? 0.6 : 0.4)
        .attr('rx', 2)
        .attr('ry', 2);

      // Add the label text
      link
        .append('text')
        .attr('class', 'link-label')
        .attr('font-size', '10px')
        .attr('fill', (d) => d.isSelfReference ? '#2e7d32' : colors.linkColor)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .text((d) => d.sourceField.name || '');
    }

    // Link event handlers
    this.attachLinkEventHandlers(link);

    // Create nodes
    const nodeGroup = chartArea
      .selectAll('.node')
      .data(this.visibleNodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', this.readOnly ? 'default' : 'pointer');

    if (cfg.enableDragging && !this.readOnly) {
      nodeGroup.call(
        d3.drag<SVGGElement, InternalNode>()
          .on('start', (event, d) => this.dragstarted(event, d))
          .on('drag', (event, d) => this.dragged(event, d))
          .on('end', (event, d) => this.dragended(event, d))
      );
    }

    // Node rectangle
    nodeGroup
      .append('rect')
      .attr('class', 'entity-rect')
      .attr('width', (d) => d.width)
      .attr('height', (d) => d.height)
      .attr('x', (d) => -d.width / 2)
      .attr('y', (d) => -d.height / 2)
      .attr('fill', colors.nodeBackground)
      .attr('stroke', colors.nodeBorder)
      .attr('stroke-width', 2)
      .attr('rx', 4);

    // Node header
    nodeGroup
      .append('rect')
      .attr('class', 'entity-header')
      .attr('width', (d) => d.width)
      .attr('height', 30)
      .attr('x', (d) => -d.width / 2)
      .attr('y', (d) => -d.height / 2)
      .attr('fill', colors.nodeHeader)
      .attr('rx', 4);

    nodeGroup
      .append('rect')
      .attr('class', 'entity-header-bottom')
      .attr('width', (d) => d.width)
      .attr('height', 15)
      .attr('x', (d) => -d.width / 2)
      .attr('y', (d) => -d.height / 2 + 15)
      .attr('fill', colors.nodeHeader);

    // Node name
    nodeGroup
      .append('text')
      .attr('class', 'entity-name')
      .attr('text-anchor', 'middle')
      .attr('y', (d) => -d.height / 2 + 20)
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill', colors.nodeHeaderText)
      .text((d) => d.name);

    // Add fields if configured
    if (cfg.showFieldDetails) {
      this.renderNodeFields(nodeGroup, colors);
    }

    // Event handlers
    this.attachNodeEventHandlers(nodeGroup);

    // Tooltips
    nodeGroup
      .append('title')
      .text((d) => `${d.name}\nPrimary Keys: ${d.primaryKeys.length}\nForeign Keys: ${d.foreignKeys.length}`);

    // Handle layout completion based on algorithm type
    if (this.usesDagreLayout()) {
      // Dagre layout is synchronous - positions are already set
      this.updatePositions(link, nodeGroup);
      this.layoutCompleted = true;
      this.layoutComplete.emit();

      // Fit to view after positions are set
      if (cfg.fitOnLoad && this.visibleNodes.length > 1) {
        setTimeout(() => this.zoomToFit(), 50);
      }
    } else if (this.simulation) {
      // Force simulation layout
      if (cfg.skipAnimation) {
        // Run simulation to completion without animation
        this.simulation.stop();

        // Run enough ticks to settle the layout (typically 300 is enough)
        const tickCount = 300;
        for (let i = 0; i < tickCount; i++) {
          this.simulation.tick();
        }

        // Update positions once at the end
        this.updatePositions(link, nodeGroup);
        this.layoutCompleted = true;
        this.layoutComplete.emit();

        // Fit to view after positions are set
        if (cfg.fitOnLoad && this.visibleNodes.length > 1) {
          setTimeout(() => this.zoomToFit(), 50);
        }
      } else {
        // Normal animated mode
        // Simulation tick
        this.simulation.on('tick', () => {
          this.updatePositions(link, nodeGroup);
        });

        // Layout complete detection
        this.simulation.on('end', () => {
          if (!this.layoutCompleted) {
            this.layoutCompleted = true;
            this.layoutComplete.emit();
            if (cfg.fitOnLoad && this.visibleNodes.length > 1) {
              setTimeout(() => this.zoomToFit(), 100);
            }
          }
        });
      }
    }

    // Apply initial selection highlighting
    this.updateSelectionHighlighting();
    this.updateHighlighting();
  }

  private renderNodeFields(
    nodeGroup: d3.Selection<SVGGElement, InternalNode, SVGGElement, unknown>,
    colors: Required<ERDColorScheme>
  ): void {
    nodeGroup.each((d, i, nodes) => {
      const group = d3.select(nodes[i]);
      let currentY = -d.height / 2 + 40;

      // Primary keys
      d.primaryKeys.forEach((pk) => {
        const fieldGroup = group.append('g').attr('class', 'field-group primary-key');

        fieldGroup
          .append('rect')
          .attr('class', 'field-bg')
          .attr('x', -d.width / 2 + 2)
          .attr('y', currentY - 15)
          .attr('width', d.width - 4)
          .attr('height', 18)
          .attr('fill', colors.primaryKeyBackground);

        fieldGroup
          .append('text')
          .attr('class', 'field-icon')
          .attr('x', -d.width / 2 + 8)
          .attr('y', currentY - 2)
          .attr('font-size', '10px')
          .attr('fill', colors.primaryKeyText)
          .text('🔑');

        fieldGroup
          .append('text')
          .attr('class', 'field-name')
          .attr('x', -d.width / 2 + 25)
          .attr('y', currentY - 2)
          .attr('font-size', '11px')
          .attr('font-weight', 'bold')
          .attr('fill', colors.primaryKeyText)
          .text(pk.name || '');

        currentY += 20;
      });

      // Foreign keys
      d.foreignKeys.forEach((fk) => {
        const fieldGroup = group.append('g').attr('class', 'field-group foreign-key');

        fieldGroup
          .append('rect')
          .attr('class', 'field-bg')
          .attr('x', -d.width / 2 + 2)
          .attr('y', currentY - 15)
          .attr('width', d.width - 4)
          .attr('height', 18)
          .attr('fill', colors.foreignKeyBackground);

        fieldGroup
          .append('text')
          .attr('class', 'field-icon')
          .attr('x', -d.width / 2 + 8)
          .attr('y', currentY - 2)
          .attr('font-size', '10px')
          .attr('fill', colors.foreignKeyText)
          .text('🔗');

        fieldGroup
          .append('text')
          .attr('class', 'field-name')
          .attr('x', -d.width / 2 + 25)
          .attr('y', currentY - 2)
          .attr('font-size', '11px')
          .attr('fill', colors.foreignKeyText)
          .text(fk.name || '');

        currentY += 20;
      });
    });
  }

  private attachNodeEventHandlers(
    nodeGroup: d3.Selection<SVGGElement, InternalNode, SVGGElement, unknown>
  ): void {
    nodeGroup
      .on('click', (event: MouseEvent, d: InternalNode) => {
        if (this.readOnly) return;
        event.stopPropagation();

        // Emit click event with cancel pattern
        const clickEvent: ERDNodeClickEvent = {
          node: d.node,
          mouseEvent: event,
          cancel: false
        };
        this.nodeClick.emit(clickEvent);

        if (clickEvent.cancel) {
          return;
        }

        // Handle selection
        if (this.selectedNodeId === d.node.id) {
          this.nodeDeselected.emit();
        } else {
          this.nodeSelected.emit(d.node);

          // Auto-zoom if node is too small
          if (this.svg) {
            const currentTransform = d3.zoomTransform(this.svg.node()!);
            const currentRenderedWidth = d.width * currentTransform.k;
            if (currentRenderedWidth < 20) {
              this.zoomToNode(d.node.id);
            }
          }
        }

        this.updateSelectionHighlighting();
      })
      .on('dblclick', (event: MouseEvent, d: InternalNode) => {
        event.stopPropagation();

        const dblClickEvent: ERDNodeDoubleClickEvent = {
          node: d.node,
          mouseEvent: event,
          cancel: false
        };
        this.nodeDoubleClick.emit(dblClickEvent);
      })
      .on('mouseenter', (event: MouseEvent, d: InternalNode) => {
        const relatedInfo = this.getRelatedNodes(d.node.id, 1);
        const relatedNodes = relatedInfo.map(r => r.node);

        const hoverEvent: ERDNodeHoverEvent = {
          node: d.node,
          mouseEvent: event,
          relatedNodes,
          position: { x: event.clientX, y: event.clientY }
        };
        this.nodeHover.emit(hoverEvent);
      })
      .on('mouseleave', (_event: MouseEvent, d: InternalNode) => {
        this.nodeHoverEnd.emit(d.node);
      })
      .on('contextmenu', (event: MouseEvent, d: InternalNode) => {
        const contextEvent: ERDNodeContextMenuEvent = {
          node: d.node,
          mouseEvent: event,
          cancel: false,
          position: { x: event.clientX, y: event.clientY }
        };
        this.nodeContextMenu.emit(contextEvent);

        if (contextEvent.cancel) {
          event.preventDefault();
        }
      });
  }

  private attachLinkEventHandlers(
    linkGroup: d3.Selection<SVGGElement, InternalLink, SVGGElement, unknown>
  ): void {
    linkGroup
      .on('click', (event: MouseEvent, d: InternalLink) => {
        event.stopPropagation();

        const sourceNode = (d.source as InternalNode).node;
        const targetNode = (d.target as InternalNode).node;

        const link: ERDLink = {
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          sourceField: d.sourceField,
          targetField: d.targetField,
          isSelfReference: d.isSelfReference
        };

        const clickEvent: ERDLinkClickEvent = {
          link,
          sourceNode,
          targetNode,
          mouseEvent: event,
          cancel: false
        };
        this.linkClick.emit(clickEvent);
      })
      .on('mouseenter', (event: MouseEvent, d: InternalLink) => {
        const sourceNode = (d.source as InternalNode).node;
        const targetNode = (d.target as InternalNode).node;

        const link: ERDLink = {
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          sourceField: d.sourceField,
          targetField: d.targetField,
          isSelfReference: d.isSelfReference
        };

        const hoverEvent: ERDLinkHoverEvent = {
          link,
          sourceNode,
          targetNode,
          mouseEvent: event,
          position: { x: event.clientX, y: event.clientY }
        };
        this.linkHover.emit(hoverEvent);
      })
      .on('mouseleave', (_event: MouseEvent, d: InternalLink) => {
        const sourceNode = (d.source as InternalNode).node;
        const targetNode = (d.target as InternalNode).node;

        const link: ERDLink = {
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          sourceField: d.sourceField,
          targetField: d.targetField,
          isSelfReference: d.isSelfReference
        };
        this.linkHoverEnd.emit(link);
      })
      .on('contextmenu', (event: MouseEvent, d: InternalLink) => {
        const sourceNode = (d.source as InternalNode).node;
        const targetNode = (d.target as InternalNode).node;

        const link: ERDLink = {
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          sourceField: d.sourceField,
          targetField: d.targetField,
          isSelfReference: d.isSelfReference
        };

        const contextEvent: ERDLinkContextMenuEvent = {
          link,
          sourceNode,
          targetNode,
          mouseEvent: event,
          cancel: false,
          position: { x: event.clientX, y: event.clientY }
        };
        this.linkContextMenu.emit(contextEvent);

        if (contextEvent.cancel) {
          event.preventDefault();
        }
      });
  }

  private updatePositions(
    link: d3.Selection<SVGGElement, InternalLink, SVGGElement, unknown>,
    nodeGroup: d3.Selection<SVGGElement, InternalNode, SVGGElement, unknown>
  ): void {
    const usesDagre = this.usesDagreLayout();

    // Update link paths
    link.select('path').attr('d', (d) => {
      const source = d.source as InternalNode;
      const target = d.target as InternalNode;

      if (d.isSelfReference) {
        // Create a larger loop that goes around the bottom of the entity
        // Start from right side, loop down and around, return to left side
        const startX = source.x! + source.width / 2;  // Right edge center
        const startY = source.y!;
        const endY = source.y! + source.height / 2;   // Bottom edge Y
        const loopExtent = 60;  // How far out the loop extends

        // Use a path that goes: right edge -> curves down-right -> bottom -> curves up to bottom edge
        return `M ${startX} ${startY}
                C ${startX + loopExtent} ${startY},
                  ${startX + loopExtent} ${endY + loopExtent},
                  ${source.x!} ${endY + loopExtent}
                C ${source.x! - loopExtent} ${endY + loopExtent},
                  ${source.x! - source.width / 2 - loopExtent / 2} ${endY},
                  ${source.x! - source.width / 2} ${endY}`;
      }

      // Use dagre edge points if available (provides cleaner orthogonal paths)
      if (usesDagre && d.points && d.points.length >= 2) {
        return this.createPathFromDagrePoints(d.points);
      }

      // Fallback to manual orthogonal path
      const sourcePoint = this.getSourceConnectionPoint(source, d.sourceField);
      const targetPoint = this.getTargetConnectionPoint(target, d.targetField);
      return this.createOrthogonalPath(sourcePoint, targetPoint);
    });

    // Update link labels and their background boxes
    link.select('text').attr('transform', (d) => {
      const source = d.source as InternalNode;
      const target = d.target as InternalNode;

      if (d.isSelfReference) {
        // Position label at the bottom of the loop (below the entity)
        const loopExtent = 60;
        return `translate(${source.x!}, ${source.y! + source.height / 2 + loopExtent + 8})`;
      }

      // Use midpoint of dagre edge points if available
      if (usesDagre && d.points && d.points.length >= 2) {
        const midIndex = Math.floor(d.points.length / 2);
        const midPoint = d.points[midIndex];
        return `translate(${midPoint.x}, ${midPoint.y})`;
      }

      // Fallback to midpoint between nodes
      const midX = (source.x! + target.x!) / 2;
      const midY = (source.y! + target.y!) / 2;
      return `translate(${midX}, ${midY - 8})`;
    });

    // Update label background rects to match text size and position
    link.each(function() {
      const group = d3.select(this);
      const textEl = group.select('text.link-label').node() as SVGTextElement | null;
      const bgRect = group.select('rect.link-label-bg');

      if (textEl && !bgRect.empty()) {
        const bbox = textEl.getBBox();
        const padding = 3;

        // Get the transform from the text element
        const transform = group.select('text.link-label').attr('transform');

        bgRect
          .attr('x', bbox.x - padding)
          .attr('y', bbox.y - padding)
          .attr('width', bbox.width + padding * 2)
          .attr('height', bbox.height + padding * 2)
          .attr('transform', transform);
      }
    });

    // Update node positions
    nodeGroup.attr('transform', (d) => `translate(${d.x},${d.y})`);
  }

  // ============================================================================
  // GEOMETRY HELPERS
  // ============================================================================

  private getSourceConnectionPoint(sourceNode: InternalNode, field?: ERDField): { x: number; y: number } {
    let connectY = sourceNode.y!;

    if (field) {
      const fkIndex = sourceNode.foreignKeys.findIndex((fk) => fk.id === field.id);
      if (fkIndex >= 0) {
        const fieldY = -sourceNode.height / 2 + 40 + sourceNode.primaryKeys.length * 20 + fkIndex * 20;
        connectY = sourceNode.y! + fieldY + 10;
      }
    }

    return {
      x: sourceNode.x! + sourceNode.width / 2,
      y: connectY,
    };
  }

  private getTargetConnectionPoint(targetNode: InternalNode, targetField?: ERDField): { x: number; y: number } {
    let connectY = targetNode.y! - targetNode.height / 2 + 40;

    if (targetField && targetField.isPrimaryKey) {
      const pkIndex = targetNode.primaryKeys.findIndex((pk) => pk.id === targetField.id);
      if (pkIndex >= 0) {
        const fieldY = -targetNode.height / 2 + 40 + pkIndex * 20;
        connectY = targetNode.y! + fieldY + 10;
      }
    }

    return {
      x: targetNode.x! - targetNode.width / 2,
      y: connectY,
    };
  }

  private createOrthogonalPath(source: { x: number; y: number }, target: { x: number; y: number }): string {
    const dx = target.x - source.x;
    let midX: number;

    if (dx > 0) {
      midX = source.x + dx * 0.7;
    } else {
      midX = source.x + Math.max(dx * 0.3, -50);
    }

    return `M ${source.x} ${source.y}
            L ${midX} ${source.y}
            L ${midX} ${target.y}
            L ${target.x} ${target.y}`;
  }

  /**
   * Creates an SVG path string from dagre's edge points.
   * Dagre provides an array of points for each edge that forms a clean orthogonal path.
   * @param points Array of {x, y} coordinates from dagre layout
   * @returns SVG path string
   */
  private createPathFromDagrePoints(points: Array<{ x: number; y: number }>): string {
    if (!points || points.length < 2) {
      return '';
    }

    // Start with Move to first point
    let path = `M ${points[0].x} ${points[0].y}`;

    // Add Line to each subsequent point
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }

    return path;
  }

  private screenToDiagramCoords(screenX: number, screenY: number): { x: number; y: number } {
    if (!this.svg) return { x: 0, y: 0 };

    const svgNode = this.svg.node();
    if (!svgNode) return { x: 0, y: 0 };

    const rect = svgNode.getBoundingClientRect();
    const transform = d3.zoomTransform(svgNode);

    return {
      x: (screenX - rect.left - transform.x) / transform.k,
      y: (screenY - rect.top - transform.y) / transform.k
    };
  }

  // ============================================================================
  // HIGHLIGHTING
  // ============================================================================

  private clearAllHighlighting(): void {
    if (!this.svg) return;

    this.svg.selectAll('.node')
      .classed('selected', false)
      .classed('highlighted', false)
      .classed('relationship-connected', false)
      .classed('entity-connections-highlighted', false);

    this.svg.selectAll('.entity-rect')
      .classed('highlighted', false)
      .classed('relationship-highlighted', false)
      .classed('connection-highlighted', false)
      .style('stroke', this.mergedConfig.colors?.nodeBorder || '#333')
      .style('stroke-width', '2px')
      .style('filter', null);

    this.svg.selectAll('.link-group')
      .classed('highlighted', false);

    this.svg.selectAll('.link')
      .classed('highlighted', false);

    this.svg.selectAll('.link-label')
      .classed('highlighted', false);
  }

  private updateSelectionHighlighting(): void {
    if (!this.svg) return;

    // Clear previous selection styling
    this.svg.selectAll('.node')
      .classed('selected', false)
      .select('.entity-rect')
      .style('stroke', this.mergedConfig.colors?.nodeBorder || '#333')
      .style('stroke-width', '2px')
      .style('filter', null);

    if (this.selectedNodeId) {
      const selectedColor = this.mergedConfig.colors?.selectedBorder || '#4CAF50';

      this.svg.selectAll('.node')
        .filter((d: unknown) => (d as InternalNode).id === this.selectedNodeId)
        .classed('selected', true)
        .select('.entity-rect')
        .style('stroke', selectedColor)
        .style('stroke-width', '4px')
        .style('filter', `drop-shadow(0 0 8px ${selectedColor}80)`);
    }
  }

  private updateHighlighting(): void {
    if (!this.svg) return;

    const highlightColor = this.mergedConfig.colors?.highlightBorder || '#ff9800';
    const highlightSet = new Set(this.highlightedNodeIds);

    this.svg.selectAll('.node')
      .classed('highlighted', (d: unknown) => highlightSet.has((d as InternalNode).id))
      .filter((d: unknown) => highlightSet.has((d as InternalNode).id))
      .select('.entity-rect')
      .style('stroke', highlightColor)
      .style('stroke-width', '3px')
      .style('filter', `drop-shadow(0 0 6px ${highlightColor}80)`);
  }

  private emitStateChange(): void {
    const state = this.getState();
    this.stateChange.emit(state);
  }

  // ============================================================================
  // DRAG HANDLERS
  // ============================================================================

  private dragstarted(event: d3.D3DragEvent<SVGGElement, InternalNode, InternalNode>, d: InternalNode): void {
    if (this.isLayoutFrozen) return;

    const dragEvent: ERDNodeDragEvent = {
      node: d.node,
      startPosition: { x: d.x || 0, y: d.y || 0 },
      currentPosition: { x: d.x || 0, y: d.y || 0 },
      cancel: false
    };
    this.nodeDragStart.emit(dragEvent);

    if (dragEvent.cancel) return;

    if (!event.active && this.simulation) {
      this.simulation.alphaTarget(0.3).restart();
    }
    d.fx = d.x;
    d.fy = d.y;
  }

  private dragged(event: d3.D3DragEvent<SVGGElement, InternalNode, InternalNode>, d: InternalNode): void {
    if (this.isLayoutFrozen) return;

    d.fx = event.x;
    d.fy = event.y;
  }

  private dragended(event: d3.D3DragEvent<SVGGElement, InternalNode, InternalNode>, d: InternalNode): void {
    if (this.isLayoutFrozen) return;

    const dragEvent: ERDNodeDragEvent = {
      node: d.node,
      startPosition: { x: 0, y: 0 }, // Start position not tracked in drag
      currentPosition: { x: d.x || 0, y: d.y || 0 },
      cancel: false
    };
    this.nodeDragEnd.emit(dragEvent);

    if (!event.active && this.simulation) {
      this.simulation.alphaTarget(0);
    }
    d.fx = null;
    d.fy = null;
  }
}
