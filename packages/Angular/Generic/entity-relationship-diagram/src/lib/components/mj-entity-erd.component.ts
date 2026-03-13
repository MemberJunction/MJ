import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ChangeDetectionStrategy
} from '@angular/core';
import { EntityInfo, Metadata } from '@memberjunction/core';
import { ERDDiagramComponent } from './erd-diagram.component';
import {
  ERDNode,
  ERDConfig,
  ERDState,
  ERDNodeClickEvent,
  ERDNodeDoubleClickEvent,
  ERDZoomEvent
} from '../interfaces/erd-types';
import {
  buildERDDataFromEntities,
  getOriginalEntityFromERDNode
} from '../utils/entity-to-erd-adapter';

/**
 * Event emitted when an entity is selected in the ERD.
 * Set `cancel = true` in your handler to prevent default behavior.
 */
export interface EntitySelectedEvent {
  /** The selected EntityInfo */
  entity: EntityInfo;
  /** The corresponding ERD node */
  node: ERDNode;
  /**
   * Set to true to cancel default behavior.
   * Default behavior: updates internal selection state.
   */
  cancel?: boolean;
}

/**
 * Event emitted when requesting to open an entity record.
 * Set `cancel = true` in your handler to prevent default behavior.
 */
export interface OpenEntityRecordEvent {
  /** Entity name for the record */
  EntityName: string;
  /** Record ID to open */
  RecordID: string;
  /** The EntityInfo being opened */
  entity: EntityInfo;
  /**
   * Set to true to cancel default behavior.
   * Default behavior: none (just emits the event).
   * Container is expected to handle navigation.
   */
  cancel?: boolean;
}

/**
 * Higher-level MemberJunction Entity ERD component that provides a simplified API
 * for displaying entity relationship diagrams using EntityInfo objects.
 *
 * This component wraps the generic `ERDDiagramComponent` and handles the transformation
 * of MemberJunction EntityInfo objects to the generic ERD format automatically.
 *
 * ## Key Features
 *
 * - **Simple Input**: Just pass `EntityInfo[]` - no manual transformation needed
 * - **Auto-Discovery**: Automatically discovers and displays relationships
 * - **Configurable Depth**: Control how many relationship hops to include
 * - **State Control**: Parent controls selection/state - component doesn't persist
 *
 * ## Usage Modes
 *
 * ### Single Entity Mode (Entity Form)
 * Show one entity and its immediate relationships:
 *
 * ```html
 * <mj-entity-erd
 *   [entities]="[currentEntity]"
 *   [selectedEntityId]="currentEntity.ID"
 *   [depth]="1"
 *   (openRecord)="onOpenRecord($event)">
 * </mj-entity-erd>
 * ```
 *
 * ### Multi-Entity Mode (Schema Explorer)
 * Show multiple entities with persistence handled by parent:
 *
 * ```html
 * <mj-entity-erd
 *   [entities]="filteredEntities"
 *   [selectedEntityId]="savedSelectedId"
 *   [depth]="savedDepth"
 *   (entitySelected)="onEntitySelected($event); saveState()"
 *   (stateChange)="onStateChange($event); saveState()"
 *   (openRecord)="onOpenRecord($event)">
 * </mj-entity-erd>
 * ```
 *
 * ## Important Design Decisions
 *
 * - **No State Persistence**: This component does NOT persist user state (selection, zoom, etc.).
 *   The parent is responsible for saving/restoring state via the inputs and events.
 * - **No Filtering**: The caller filters entities before passing them. This keeps the component simple.
 * - **Controlled Selection**: Selection is controlled via `selectedEntityId` input. The component
 *   emits `entitySelected` when user clicks, but parent decides what to do.
 *
 * @see ERDDiagramComponent for the underlying generic component
 */
@Component({
  standalone: false,
  selector: 'mj-entity-erd',
  template: `
    <mj-erd-diagram
      [nodes]="erdNodes"
      [selectedNodeId]="selectedEntityId"
      [highlightedNodeIds]="highlightedEntityIds"
      [focusNodeId]="focusEntityId"
      [focusDepth]="focusDepth"
      [config]="config"
      [showHeader]="showHeader"
      [headerTitle]="headerTitle"
      [isRefreshing]="isRefreshing"
      [readOnly]="readOnly"
      (nodeClick)="onNodeClick($event)"
      (nodeDoubleClick)="onNodeDoubleClick($event)"
      (nodeSelected)="onNodeSelected($event)"
      (nodeDeselected)="onNodeDeselected()"
      (zoomChange)="onZoomChange($event)"
      (stateChange)="onStateChange($event)"
      (refreshRequested)="onRefreshRequested()">
    </mj-erd-diagram>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MJEntityERDComponent implements OnChanges {
  @ViewChild(ERDDiagramComponent) erdDiagram!: ERDDiagramComponent;

  // ============================================================================
  // INPUTS - Data
  // ============================================================================

  /**
   * The entities to display in the ERD.
   * Pass one or more EntityInfo objects. The component will automatically
   * discover and display related entities based on the `depth` setting.
   *
   * @example
   * ```typescript
   * // Single entity
   * [entities]="[currentEntity]"
   *
   * // Multiple entities (schema view)
   * [entities]="filteredEntities"
   * ```
   */
  @Input() entities: EntityInfo[] = [];

  /**
   * All entities in the system for relationship discovery.
   * If not provided, uses Metadata.Entities automatically.
   * This is used to look up related entities when building the ERD.
   */
  @Input() allEntities?: EntityInfo[];

  /**
   * ID of the currently selected entity.
   * Controlled by parent - the component emits selection events but doesn't
   * manage selection state internally.
   */
  @Input() selectedEntityId: string | null = null;

  /**
   * IDs of entities to highlight (in addition to selected).
   */
  @Input() highlightedEntityIds: string[] = [];

  /**
   * ID of entity to focus on (shows only this entity and related up to depth).
   * If null, shows all provided entities.
   */
  @Input() focusEntityId: string | null = null;

  /**
   * Focus depth when focusEntityId is set.
   */
  @Input() focusDepth = 1;

  // ============================================================================
  // INPUTS - Relationship Options
  // ============================================================================

  /**
   * Number of relationship hops to include when auto-discovering related entities.
   * - `0`: Show only the provided entities (no auto-discovery)
   * - `1`: Show provided entities + directly related entities (default)
   * - `2+`: Show entities within N relationship hops
   *
   * @default 1
   */
  @Input() depth = 1;

  /**
   * Include incoming relationships (entities that reference these entities).
   * @default true
   */
  @Input() includeIncoming = true;

  /**
   * Include outgoing relationships (entities these reference via FK).
   * @default true
   */
  @Input() includeOutgoing = true;

  // ============================================================================
  // INPUTS - Configuration
  // ============================================================================

  /**
   * Configuration options passed to the underlying ERD component.
   */
  @Input() config: ERDConfig = {};

  /**
   * Whether to show the header bar with controls.
   * @default true
   */
  @Input() showHeader = true;

  /**
   * Title for the header bar.
   */
  @Input() headerTitle = 'Entity Relationship Diagram';

  /**
   * Whether the diagram is in a loading/refreshing state.
   */
  @Input() isRefreshing = false;

  /**
   * Whether the diagram is read-only (no selection/dragging).
   */
  @Input() readOnly = false;

  // ============================================================================
  // OUTPUTS
  // ============================================================================

  /**
   * Emitted when an entity is selected by clicking.
   * The parent should update `selectedEntityId` in response.
   */
  @Output() entitySelected = new EventEmitter<EntitySelectedEvent>();

  /**
   * Emitted when the selection is cleared.
   */
  @Output() entityDeselected = new EventEmitter<void>();

  /**
   * Emitted when an entity is double-clicked.
   * Typically used to open the entity record.
   */
  @Output() entityDoubleClick = new EventEmitter<EntitySelectedEvent>();

  /**
   * Emitted when requesting to open an entity record.
   * This is the standard MJ pattern for navigation.
   */
  @Output() openRecord = new EventEmitter<OpenEntityRecordEvent>();

  /**
   * Emitted when zoom/pan changes.
   * Parent can use this for state persistence.
   */
  @Output() zoomChange = new EventEmitter<ERDZoomEvent>();

  /**
   * Emitted when diagram state changes (selection, zoom, etc.).
   * Parent can use this for state persistence.
   */
  @Output() stateChange = new EventEmitter<ERDState>();

  /**
   * Emitted when user requests a refresh via the header button.
   */
  @Output() refreshRequested = new EventEmitter<void>();

  // ============================================================================
  // INTERNAL STATE
  // ============================================================================

  /** Computed ERD nodes */
  erdNodes: ERDNode[] = [];

  private _metadata = new Metadata();

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  ngOnChanges(changes: SimpleChanges): void {
    // Rebuild ERD data when entities or relationship options change
    if (
      changes['entities'] ||
      changes['allEntities'] ||
      changes['depth'] ||
      changes['includeIncoming'] ||
      changes['includeOutgoing']
    ) {
      this.buildERDData();
    }
  }

  // ============================================================================
  // ERD DATA BUILDING
  // ============================================================================

  private buildERDData(): void {
    if (!this.entities || this.entities.length === 0) {
      this.erdNodes = [];
      return;
    }

    // Use provided allEntities or fall back to Metadata
    const allEntities = this.allEntities || this._metadata.Entities;

    const result = buildERDDataFromEntities(this.entities, {
      allEntities,
      includeIncoming: this.includeIncoming,
      includeOutgoing: this.includeOutgoing,
      depth: this.depth
    });

    // Note: Links are derived automatically by the ERD diagram component
    // from the node field relationships (relatedNodeId)
    this.erdNodes = result.nodes;
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  onNodeClick(_event: ERDNodeClickEvent): void {
    // Let the base component handle the click
    // Selection is handled via nodeSelected
  }

  onNodeDoubleClick(event: ERDNodeDoubleClickEvent): void {
    const entity = getOriginalEntityFromERDNode(event.node);
    if (entity) {
      this.entityDoubleClick.emit({ entity, node: event.node });
      // Also emit openRecord for convenience - container handles navigation
      this.openRecord.emit({
        EntityName: 'MJ: Entities',
        RecordID: entity.ID,
        entity
      });
    }
  }

  onNodeSelected(node: ERDNode): void {
    const entity = getOriginalEntityFromERDNode(node);
    if (entity) {
      this.entitySelected.emit({ entity, node });
    }
  }

  onNodeDeselected(): void {
    this.entityDeselected.emit();
  }

  onZoomChange(event: ERDZoomEvent): void {
    this.zoomChange.emit(event);
  }

  onStateChange(state: ERDState): void {
    this.stateChange.emit(state);
  }

  onRefreshRequested(): void {
    this.refreshRequested.emit();
  }

  // ============================================================================
  // PUBLIC API (Delegates to underlying component)
  // ============================================================================

  /**
   * Zoom in on the diagram.
   */
  public zoomIn(): void {
    this.erdDiagram?.zoomIn();
  }

  /**
   * Zoom out on the diagram.
   */
  public zoomOut(): void {
    this.erdDiagram?.zoomOut();
  }

  /**
   * Reset zoom to default.
   */
  public resetZoom(): void {
    this.erdDiagram?.resetZoom();
  }

  /**
   * Fit all nodes in view.
   */
  public zoomToFit(padding?: number): void {
    this.erdDiagram?.zoomToFit(padding);
  }

  /**
   * Zoom to a specific entity.
   */
  public zoomToEntity(entityId: string, scale?: number): void {
    this.erdDiagram?.zoomToNode(entityId, scale);
  }

  /**
   * Get current diagram state for persistence.
   */
  public getState(): ERDState | null {
    return this.erdDiagram?.getState() || null;
  }

  /**
   * Restore diagram state.
   */
  public setState(state: Partial<ERDState>, restorePositions?: boolean): void {
    this.erdDiagram?.setState(state, restorePositions);
  }

  /**
   * Refresh the diagram.
   */
  public refresh(): void {
    this.buildERDData();
    this.erdDiagram?.refresh();
  }

  /**
   * Export diagram as SVG.
   */
  public exportAsSVG(): string {
    return this.erdDiagram?.exportAsSVG() || '';
  }

  /**
   * Trigger a resize recalculation. Call this when the container size changes.
   */
  public triggerResize(): void {
    this.erdDiagram?.triggerResize();
  }
}
