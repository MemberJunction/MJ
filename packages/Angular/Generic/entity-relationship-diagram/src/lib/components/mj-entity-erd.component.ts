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
import { EntityInfo } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
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
  BuildERDDataFromEntities,
  GetOriginalEntityFromERDNode
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
export class MJEntityERDComponent extends BaseAngularComponent implements OnChanges {
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
  @Input() Entities: EntityInfo[] = [];

  /** @deprecated Use {@link Entities}. */
  @Input() set entities(value: EntityInfo[]) {
    this.Entities = value;
  }
  /** @deprecated Use {@link Entities}. */
  get entities(): EntityInfo[] {
    return this.Entities;
  }

  /**
   * All entities in the system for relationship discovery.
   * If not provided, uses Metadata.Entities automatically.
   * This is used to look up related entities when building the ERD.
   */
  @Input() AllEntities?: EntityInfo[];

  /** @deprecated Use {@link AllEntities}. */
  @Input() set allEntities(value: EntityInfo[] | undefined) {
    this.AllEntities = value;
  }
  /** @deprecated Use {@link AllEntities}. */
  get allEntities(): EntityInfo[] | undefined {
    return this.AllEntities;
  }

  /**
   * ID of the currently selected entity.
   * Controlled by parent - the component emits selection events but doesn't
   * manage selection state internally.
   */
  @Input() SelectedEntityId: string | null = null;

  /** @deprecated Use {@link SelectedEntityId}. */
  @Input() set selectedEntityId(value: string | null) {
    this.SelectedEntityId = value;
  }
  /** @deprecated Use {@link SelectedEntityId}. */
  get selectedEntityId(): string | null {
    return this.SelectedEntityId;
  }

  /**
   * IDs of entities to highlight (in addition to selected).
   */
  @Input() HighlightedEntityIds: string[] = [];

  /** @deprecated Use {@link HighlightedEntityIds}. */
  @Input() set highlightedEntityIds(value: string[]) {
    this.HighlightedEntityIds = value;
  }
  /** @deprecated Use {@link HighlightedEntityIds}. */
  get highlightedEntityIds(): string[] {
    return this.HighlightedEntityIds;
  }

  /**
   * ID of entity to focus on (shows only this entity and related up to depth).
   * If null, shows all provided entities.
   */
  @Input() FocusEntityId: string | null = null;

  /** @deprecated Use {@link FocusEntityId}. */
  @Input() set focusEntityId(value: string | null) {
    this.FocusEntityId = value;
  }
  /** @deprecated Use {@link FocusEntityId}. */
  get focusEntityId(): string | null {
    return this.FocusEntityId;
  }

  /**
   * Focus depth when focusEntityId is set.
   */
  @Input() FocusDepth = 1;

  /** @deprecated Use {@link FocusDepth}. */
  @Input() set focusDepth(value: MJEntityERDComponent['FocusDepth']) {
    this.FocusDepth = value;
  }
  /** @deprecated Use {@link FocusDepth}. */
  get focusDepth(): MJEntityERDComponent['FocusDepth'] {
    return this.FocusDepth;
  }

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
  @Input() Depth = 1;

  /** @deprecated Use {@link Depth}. */
  @Input() set depth(value: MJEntityERDComponent['Depth']) {
    this.Depth = value;
  }
  /** @deprecated Use {@link Depth}. */
  get depth(): MJEntityERDComponent['Depth'] {
    return this.Depth;
  }

  /**
   * Include incoming relationships (entities that reference these entities).
   * @default true
   */
  @Input() IncludeIncoming = true;

  /** @deprecated Use {@link IncludeIncoming}. */
  @Input() set includeIncoming(value: MJEntityERDComponent['IncludeIncoming']) {
    this.IncludeIncoming = value;
  }
  /** @deprecated Use {@link IncludeIncoming}. */
  get includeIncoming(): MJEntityERDComponent['IncludeIncoming'] {
    return this.IncludeIncoming;
  }

  /**
   * Include outgoing relationships (entities these reference via FK).
   * @default true
   */
  @Input() IncludeOutgoing = true;

  /** @deprecated Use {@link IncludeOutgoing}. */
  @Input() set includeOutgoing(value: MJEntityERDComponent['IncludeOutgoing']) {
    this.IncludeOutgoing = value;
  }
  /** @deprecated Use {@link IncludeOutgoing}. */
  get includeOutgoing(): MJEntityERDComponent['IncludeOutgoing'] {
    return this.IncludeOutgoing;
  }

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
  @Input() ShowHeader = true;

  /** @deprecated Use {@link ShowHeader}. */
  @Input() set showHeader(value: MJEntityERDComponent['ShowHeader']) {
    this.ShowHeader = value;
  }
  /** @deprecated Use {@link ShowHeader}. */
  get showHeader(): MJEntityERDComponent['ShowHeader'] {
    return this.ShowHeader;
  }

  /**
   * Title for the header bar.
   */
  @Input() HeaderTitle = 'Entity Relationship Diagram';

  /** @deprecated Use {@link HeaderTitle}. */
  @Input() set headerTitle(value: MJEntityERDComponent['HeaderTitle']) {
    this.HeaderTitle = value;
  }
  /** @deprecated Use {@link HeaderTitle}. */
  get headerTitle(): MJEntityERDComponent['HeaderTitle'] {
    return this.HeaderTitle;
  }

  /**
   * Whether the diagram is in a loading/refreshing state.
   */
  @Input() IsRefreshing = false;

  /** @deprecated Use {@link IsRefreshing}. */
  @Input() set isRefreshing(value: MJEntityERDComponent['IsRefreshing']) {
    this.IsRefreshing = value;
  }
  /** @deprecated Use {@link IsRefreshing}. */
  get isRefreshing(): MJEntityERDComponent['IsRefreshing'] {
    return this.IsRefreshing;
  }

  /**
   * Whether the diagram is read-only (no selection/dragging).
   */
  @Input() ReadOnly = false;

  /** @deprecated Use {@link ReadOnly}. */
  @Input() set readOnly(value: MJEntityERDComponent['ReadOnly']) {
    this.ReadOnly = value;
  }
  /** @deprecated Use {@link ReadOnly}. */
  get readOnly(): MJEntityERDComponent['ReadOnly'] {
    return this.ReadOnly;
  }

  // ============================================================================
  // OUTPUTS
  // ============================================================================

  /**
   * Emitted when an entity is selected by clicking.
   * The parent should update `selectedEntityId` in response.
   */
  @Output() EntitySelected = new EventEmitter<EntitySelectedEvent>();

  /**
   * @deprecated Use {@link EntitySelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (entitySelected) keeps working. Must stay AFTER EntitySelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() entitySelected = this.EntitySelected;

  /**
   * Emitted when the selection is cleared.
   */
  @Output() EntityDeselected = new EventEmitter<void>();

  /**
   * @deprecated Use {@link EntityDeselected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (entityDeselected) keeps working. Must stay AFTER EntityDeselected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() entityDeselected = this.EntityDeselected;

  /**
   * Emitted when an entity is double-clicked.
   * Typically used to open the entity record.
   */
  @Output() EntityDoubleClick = new EventEmitter<EntitySelectedEvent>();

  /**
   * @deprecated Use {@link EntityDoubleClick}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (entityDoubleClick) keeps working. Must stay AFTER EntityDoubleClick: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() entityDoubleClick = this.EntityDoubleClick;

  /**
   * Emitted when requesting to open an entity record.
   * This is the standard MJ pattern for navigation.
   */
  @Output() OpenRecord = new EventEmitter<OpenEntityRecordEvent>();

  /**
   * @deprecated Use {@link OpenRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openRecord) keeps working. Must stay AFTER OpenRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openRecord = this.OpenRecord;

  /**
   * Emitted when zoom/pan changes.
   * Parent can use this for state persistence.
   */
  @Output() ZoomChange = new EventEmitter<ERDZoomEvent>();

  /**
   * @deprecated Use {@link ZoomChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (zoomChange) keeps working. Must stay AFTER ZoomChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() zoomChange = this.ZoomChange;

  /**
   * Emitted when diagram state changes (selection, zoom, etc.).
   * Parent can use this for state persistence.
   */
  @Output() StateChange = new EventEmitter<ERDState>();

  /**
   * @deprecated Use {@link StateChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (stateChange) keeps working. Must stay AFTER StateChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() stateChange = this.StateChange;

  /**
   * Emitted when user requests a refresh via the header button.
   */
  @Output() RefreshRequested = new EventEmitter<void>();

  /**
   * @deprecated Use {@link RefreshRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (refreshRequested) keeps working. Must stay AFTER RefreshRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() refreshRequested = this.RefreshRequested;

  // ============================================================================
  // INTERNAL STATE
  // ============================================================================

  /** Computed ERD nodes */
  ErdNodes: ERDNode[] = [];

  /** @deprecated Use {@link ErdNodes}. */
  get erdNodes(): ERDNode[] {
    return this.ErdNodes;
  }
  /** @deprecated Use {@link ErdNodes}. */
  set erdNodes(value: ERDNode[]) {
    this.ErdNodes = value;
  }

  private get _metadata() { return this.ProviderToUse; }

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
    if (!this.Entities || this.Entities.length === 0) {
      this.ErdNodes = [];
      return;
    }

    // Use provided allEntities or fall back to Metadata
    const allEntities = this.AllEntities || this._metadata.Entities;

    const result = BuildERDDataFromEntities(this.Entities, {
      allEntities,
      includeIncoming: this.IncludeIncoming,
      includeOutgoing: this.IncludeOutgoing,
      depth: this.Depth
    });

    // Note: Links are derived automatically by the ERD diagram component
    // from the node field relationships (relatedNodeId)
    this.ErdNodes = result.nodes;
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  OnNodeClick(_event: ERDNodeClickEvent): void {
    // Let the base component handle the click
    // Selection is handled via nodeSelected
  }

  /** @deprecated Use {@link OnNodeClick}. */
  onNodeClick(_event: ERDNodeClickEvent): void {
    return this.OnNodeClick(_event);
  }

  OnNodeDoubleClick(event: ERDNodeDoubleClickEvent): void {
    const entity = GetOriginalEntityFromERDNode(event.node);
    if (entity) {
      this.EntityDoubleClick.emit({ entity, node: event.node });
      // Also emit openRecord for convenience - container handles navigation
      this.OpenRecord.emit({
        EntityName: 'MJ: Entities',
        RecordID: entity.ID,
        entity
      });
    }
  }

  /** @deprecated Use {@link OnNodeDoubleClick}. */
  onNodeDoubleClick(event: ERDNodeDoubleClickEvent): void {
    return this.OnNodeDoubleClick(event);
  }

  OnNodeSelected(node: ERDNode): void {
    const entity = GetOriginalEntityFromERDNode(node);
    if (entity) {
      this.EntitySelected.emit({ entity, node });
    }
  }

  /** @deprecated Use {@link OnNodeSelected}. */
  onNodeSelected(node: ERDNode): void {
    return this.OnNodeSelected(node);
  }

  OnNodeDeselected(): void {
    this.EntityDeselected.emit();
  }

  /** @deprecated Use {@link OnNodeDeselected}. */
  onNodeDeselected(): void {
    return this.OnNodeDeselected();
  }

  onZoomChange(event: ERDZoomEvent): void {
    this.ZoomChange.emit(event);
  }

  OnStateChange(state: ERDState): void {
    this.StateChange.emit(state);
  }

  /** @deprecated Use {@link OnStateChange}. */
  onStateChange(state: ERDState): void {
    return this.OnStateChange(state);
  }

  OnRefreshRequested(): void {
    this.RefreshRequested.emit();
  }

  /** @deprecated Use {@link OnRefreshRequested}. */
  onRefreshRequested(): void {
    return this.OnRefreshRequested();
  }

  // ============================================================================
  // PUBLIC API (Delegates to underlying component)
  // ============================================================================

  /**
   * Zoom in on the diagram.
   */
  public ZoomIn(): void {
    this.erdDiagram?.zoomIn();
  }

  /** @deprecated Use {@link ZoomIn}. */
  public zoomIn(): void {
    return this.ZoomIn();
  }

  /**
   * Zoom out on the diagram.
   */
  public ZoomOut(): void {
    this.erdDiagram?.zoomOut();
  }

  /** @deprecated Use {@link ZoomOut}. */
  public zoomOut(): void {
    return this.ZoomOut();
  }

  /**
   * Reset zoom to default.
   */
  public ResetZoom(): void {
    this.erdDiagram?.resetZoom();
  }

  /** @deprecated Use {@link ResetZoom}. */
  public resetZoom(): void {
    return this.ResetZoom();
  }

  /**
   * Fit all nodes in view.
   */
  public ZoomToFit(padding?: number): void {
    this.erdDiagram?.zoomToFit(padding);
  }

  /** @deprecated Use {@link ZoomToFit}. */
  public zoomToFit(padding?: number): void {
    return this.ZoomToFit(padding);
  }

  /**
   * Zoom to a specific entity.
   */
  public ZoomToEntity(entityId: string, scale?: number): void {
    this.erdDiagram?.zoomToNode(entityId, scale);
  }

  /** @deprecated Use {@link ZoomToEntity}. */
  public zoomToEntity(entityId: string, scale?: number): void {
    return this.ZoomToEntity(entityId, scale);
  }

  /**
   * Get current diagram state for persistence.
   */
  public GetState(): ERDState | null {
    return this.erdDiagram?.getState() || null;
  }

  /** @deprecated Use {@link GetState}. */
  public getState(): ERDState | null {
    return this.GetState();
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
  public Refresh(): void {
    this.buildERDData();
    this.erdDiagram?.refresh();
  }

  /** @deprecated Use {@link Refresh}. */
  public refresh(): void {
    return this.Refresh();
  }

  /**
   * Export diagram as SVG.
   */
  public ExportAsSVG(): string {
    return this.erdDiagram?.exportAsSVG() || '';
  }

  /** @deprecated Use {@link ExportAsSVG}. */
  public exportAsSVG(): string {
    return this.ExportAsSVG();
  }

  /**
   * Trigger a resize recalculation. Call this when the container size changes.
   */
  public TriggerResize(): void {
    this.erdDiagram?.triggerResize();
  }

  /** @deprecated Use {@link TriggerResize}. */
  public triggerResize(): void {
    return this.TriggerResize();
  }
}
