import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { RunView, IRunViewProvider } from '@memberjunction/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import {
  IntegrationDataService,
  ResolveIntegrationIcon,
  IntegrationSummary,
  EntityMapRow,
  FieldMapRow
} from '../../services/integration-data.service';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const SOURCE_X = 80;
const ENTITY_MAP_X = 350;
const DESTINATION_X = 620;
const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;
const ENTITY_MAP_V_SPACING = 70;
const GROUP_V_GAP = 50;
const GROUP_TOP_PADDING = 20;
const CANVAS_PADDING = 40;
const ZOOM_STEP = 0.15;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;

// ---------------------------------------------------------------------------
// Data interfaces
// ---------------------------------------------------------------------------

interface PipelineNode {
  ID: string;
  Type: 'source' | 'entityMap' | 'destination';
  Label: string;
  SubLabel: string;
  Icon: string;
  StatusColor: string;
  X: number;
  Y: number;
  Width: number;
  Height: number;
  /** The entity map row backing this node (only for entityMap type) */
  EntityMap: EntityMapRow | null;
}

interface PipelineConnection {
  FromNode: PipelineNode;
  ToNode: PipelineNode;
  StatusColor: string;
  Path: string;
  AnimationDelay: number;
}

interface PipelineGroup {
  IntegrationID: string;
  IntegrationName: string;
  StatusColor: string;
  SourceNode: PipelineNode;
  EntityMapNodes: PipelineNode[];
  DestinationNode: PipelineNode;
  Connections: PipelineConnection[];
  Y: number;
  Height: number;
}

@RegisterClass(BaseResourceComponent, 'IntegrationPipelines')
@Component({
  standalone: false,
  selector: 'app-integration-pipelines',
  templateUrl: './pipelines.component.html',
  styleUrls: ['./pipelines.component.css']
})
export class PipelinesComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  // ---------------------------------------------------------------------------
  // Public state
  // ---------------------------------------------------------------------------

  PipelineGroups: PipelineGroup[] = [];
  ViewBox = '0 0 900 400';
  ZoomLevel = 1.0;
  IsLoading = false;

  /** Currently selected entity-map node (opens detail panel) */
  SelectedNode: PipelineNode | null = null;
  /** Field maps for the selected entity-map node */
  SelectedFieldMaps: FieldMapRow[] = [];
  /** Controls CSS slide-in animation */
  DetailPanelOpen = false;
  /** Loading state for field maps */
  FieldMapsLoading = false;

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private dataService = inject(IntegrationDataService);
  private cdr = inject(ChangeDetectorRef);

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async ngOnInit(): Promise<void> {
    await this.LoadData();
  }

  ngOnDestroy(): void {
    // Clean up if needed
  }

  // ---------------------------------------------------------------------------
  // Resource overrides
  // ---------------------------------------------------------------------------

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Pipelines';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-diagram-project';
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  async LoadData(): Promise<void> {
    this.IsLoading = true;
    this.cdr.detectChanges();
    try {
      const provider = this.RunViewToUse;
      const [summaries, allEntityMaps] = await Promise.all([
        this.dataService.LoadIntegrationSummaries(provider),
        this.loadAllEntityMaps(provider)
      ]);
      this.BuildPipelineLayout(summaries, allEntityMaps);
    } catch (err) {
      console.error('[PipelinesComponent] Failed to load data:', err);
    } finally {
      this.IsLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ---------------------------------------------------------------------------
  // Layout engine
  // ---------------------------------------------------------------------------

  BuildPipelineLayout(summaries: IntegrationSummary[], allEntityMaps: EntityMapRow[]): void {
    let currentY = CANVAS_PADDING;
    const groups: PipelineGroup[] = [];

    for (const summary of summaries) {
      const maps = allEntityMaps.filter(
        m => UUIDsEqual(m.CompanyIntegrationID, summary.Integration.ID)
      );
      const group = this.buildGroupLayout(summary, maps, currentY);
      groups.push(group);
      currentY += group.Height + GROUP_V_GAP;
    }

    this.PipelineGroups = groups;
    this.updateViewBox(currentY);
  }

  // ---------------------------------------------------------------------------
  // Node click / detail panel
  // ---------------------------------------------------------------------------

  OnNodeClick(node: PipelineNode): void {
    if (node.Type !== 'entityMap' || !node.EntityMap) return;

    if (this.SelectedNode && UUIDsEqual(this.SelectedNode.ID, node.ID)) {
      this.CloseDetailPanel();
      return;
    }

    this.SelectedNode = node;
    this.SelectedFieldMaps = [];
    this.DetailPanelOpen = true;
    this.cdr.detectChanges();
    this.LoadFieldMaps(node.EntityMap.ID);
  }

  async LoadFieldMaps(entityMapID: string): Promise<void> {
    this.FieldMapsLoading = true;
    this.cdr.detectChanges();
    try {
      this.SelectedFieldMaps = await this.dataService.LoadFieldMaps(entityMapID, this.RunViewToUse);
    } catch (err) {
      console.error('[PipelinesComponent] Failed to load field maps:', err);
    } finally {
      this.FieldMapsLoading = false;
      this.cdr.detectChanges();
    }
  }

  CloseDetailPanel(): void {
    this.DetailPanelOpen = false;
    // Delay clearing node to allow slide-out animation to complete
    setTimeout(() => {
      if (!this.DetailPanelOpen) {
        this.SelectedNode = null;
        this.SelectedFieldMaps = [];
        this.cdr.detectChanges();
      }
    }, 350);
    this.cdr.detectChanges();
  }

  // ---------------------------------------------------------------------------
  // Zoom controls
  // ---------------------------------------------------------------------------

  ZoomIn(): void {
    this.ZoomLevel = Math.min(MAX_ZOOM, Math.round((this.ZoomLevel + ZOOM_STEP) * 100) / 100);
  }

  ZoomOut(): void {
    this.ZoomLevel = Math.max(MIN_ZOOM, Math.round((this.ZoomLevel - ZOOM_STEP) * 100) / 100);
  }

  FitView(): void {
    this.ZoomLevel = 1.0;
  }

  get ZoomPercent(): number {
    return Math.round(this.ZoomLevel * 100);
  }

  // ---------------------------------------------------------------------------
  // Template helpers
  // ---------------------------------------------------------------------------

  IsNodeSelected(node: PipelineNode): boolean {
    return this.SelectedNode != null && UUIDsEqual(this.SelectedNode.ID, node.ID);
  }

  DirectionLabel(direction: string): string {
    if (direction === 'Pull') return '\u2190';
    if (direction === 'Push') return '\u2192';
    if (direction === 'Bidirectional') return '\u2194';
    return '\u2192';
  }

  DirectionBadgeClass(direction: string): string {
    if (direction === 'Pull') return 'direction-badge pull';
    if (direction === 'Push') return 'direction-badge push';
    if (direction === 'Bidirectional') return 'direction-badge bidirectional';
    return 'direction-badge';
  }

  FieldDirectionLabel(direction: string): string {
    if (direction === 'SourceToDest') return '\u2192';
    if (direction === 'DestToSource') return '\u2190';
    if (direction === 'Both') return '\u2194';
    return '\u2192';
  }

  get IntegrationCount(): number {
    return this.PipelineGroups.length;
  }

  get SelectedEntityMap(): EntityMapRow | null {
    return this.SelectedNode?.EntityMap ?? null;
  }

  get ActiveFieldMaps(): FieldMapRow[] {
    return this.SelectedFieldMaps.filter(f => f.Status === 'Active');
  }

  get KeyFieldCount(): number {
    return this.ActiveFieldMaps.filter(f => f.IsKeyField).length;
  }

  get RequiredFieldCount(): number {
    return this.ActiveFieldMaps.filter(f => f.IsRequired).length;
  }

  // ---------------------------------------------------------------------------
  // SVG path generation
  // ---------------------------------------------------------------------------

  private computeBezierPath(fromX: number, fromY: number, toX: number, toY: number): string {
    const dx = (toX - fromX) * 0.5;
    return `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;
  }

  // ---------------------------------------------------------------------------
  // Private layout helpers
  // ---------------------------------------------------------------------------

  private buildGroupLayout(
    summary: IntegrationSummary,
    maps: EntityMapRow[],
    startY: number
  ): PipelineGroup {
    const mapCount = Math.max(maps.length, 1);
    const mapsBlockHeight = mapCount * ENTITY_MAP_V_SPACING;
    const groupHeight = Math.max(mapsBlockHeight, NODE_HEIGHT) + GROUP_TOP_PADDING * 2;

    const sourceNode = this.createSourceNode(summary, startY, groupHeight);
    const entityMapNodes = this.createEntityMapNodes(maps, startY, groupHeight);
    const destinationNode = this.createDestinationNode(summary, maps, startY, groupHeight);
    const connections = this.createConnections(sourceNode, entityMapNodes, destinationNode);

    return {
      IntegrationID: summary.Integration.ID,
      IntegrationName: summary.Integration.Integration ?? summary.Integration.Name,
      StatusColor: this.statusToColor(summary.StatusColor),
      SourceNode: sourceNode,
      EntityMapNodes: entityMapNodes,
      DestinationNode: destinationNode,
      Connections: connections,
      Y: startY,
      Height: groupHeight
    };
  }

  private createSourceNode(
    summary: IntegrationSummary,
    startY: number,
    groupHeight: number
  ): PipelineNode {
    const centerY = startY + groupHeight / 2 - NODE_HEIGHT / 2;
    return {
      ID: `src-${summary.Integration.ID}`,
      Type: 'source',
      Label: summary.Integration.Integration ?? summary.Integration.Name,
      SubLabel: 'Source',
      Icon: this.resolveIcon(summary),
      StatusColor: this.statusToColor(summary.StatusColor),
      X: SOURCE_X,
      Y: centerY,
      Width: NODE_WIDTH,
      Height: NODE_HEIGHT,
      EntityMap: null
    };
  }

  private createEntityMapNodes(
    maps: EntityMapRow[],
    startY: number,
    groupHeight: number
  ): PipelineNode[] {
    if (maps.length === 0) return [];

    const blockHeight = maps.length * ENTITY_MAP_V_SPACING;
    const blockStartY = startY + (groupHeight - blockHeight) / 2 + (ENTITY_MAP_V_SPACING - NODE_HEIGHT) / 2;

    return maps.map((em, i) => ({
      ID: em.ID,
      Type: 'entityMap' as const,
      Label: em.ExternalObjectLabel ?? em.ExternalObjectName,
      SubLabel: em.Entity,
      Icon: this.directionIcon(em.SyncDirection),
      StatusColor: em.SyncEnabled ? '#059669' : '#9ca3af',
      X: ENTITY_MAP_X,
      Y: blockStartY + i * ENTITY_MAP_V_SPACING,
      Width: NODE_WIDTH,
      Height: NODE_HEIGHT,
      EntityMap: em
    }));
  }

  private createDestinationNode(
    summary: IntegrationSummary,
    maps: EntityMapRow[],
    startY: number,
    groupHeight: number
  ): PipelineNode {
    const centerY = startY + groupHeight / 2 - NODE_HEIGHT / 2;
    const entityCount = new Set(maps.map(m => m.EntityID)).size;
    return {
      ID: `dest-${summary.Integration.ID}`,
      Type: 'destination',
      Label: 'MemberJunction',
      SubLabel: `${entityCount} ${entityCount === 1 ? 'entity' : 'entities'}`,
      Icon: 'fa-solid fa-database',
      StatusColor: '#059669',
      X: DESTINATION_X,
      Y: centerY,
      Width: NODE_WIDTH,
      Height: NODE_HEIGHT,
      EntityMap: null
    };
  }

  private createConnections(
    source: PipelineNode,
    entityMaps: PipelineNode[],
    destination: PipelineNode
  ): PipelineConnection[] {
    const connections: PipelineConnection[] = [];

    if (entityMaps.length === 0) {
      // Direct source-to-destination when no entity maps
      connections.push(this.buildConnection(source, destination, '#9ca3af', 0));
      return connections;
    }

    for (let i = 0; i < entityMaps.length; i++) {
      const emNode = entityMaps[i];
      connections.push(this.buildConnection(source, emNode, emNode.StatusColor, i * 0.4));
      connections.push(this.buildConnection(emNode, destination, emNode.StatusColor, i * 0.4 + 0.2));
    }

    return connections;
  }

  private buildConnection(
    from: PipelineNode,
    to: PipelineNode,
    statusColor: string,
    animDelay: number
  ): PipelineConnection {
    const fromX = from.X + from.Width;
    const fromY = from.Y + from.Height / 2;
    const toX = to.X;
    const toY = to.Y + to.Height / 2;
    return {
      FromNode: from,
      ToNode: to,
      StatusColor: statusColor,
      Path: this.computeBezierPath(fromX, fromY, toX, toY),
      AnimationDelay: animDelay
    };
  }

  private updateViewBox(totalHeight: number): void {
    const width = DESTINATION_X + NODE_WIDTH + CANVAS_PADDING * 2;
    const height = Math.max(totalHeight + CANVAS_PADDING, 400);
    this.ViewBox = `0 0 ${width} ${height}`;
  }

  // ---------------------------------------------------------------------------
  // Private data helpers
  // ---------------------------------------------------------------------------

  private async loadAllEntityMaps(provider: IRunViewProvider | null): Promise<EntityMapRow[]> {
    const rv = new RunView(provider ?? null);
    const result = await rv.RunView<EntityMapRow>({
      EntityName: 'MJ: Company Integration Entity Maps',
      ExtraFilter: '',
      OrderBy: 'CompanyIntegrationID, Priority, ExternalObjectName',
      Fields: ['ID', 'CompanyIntegrationID', 'ExternalObjectName', 'ExternalObjectLabel',
               'EntityID', 'SyncDirection', 'SyncEnabled', 'MatchStrategy',
               'ConflictResolution', 'Priority', 'DeleteBehavior', 'Status', 'Entity'],
      ResultType: 'simple'
    });
    return result.Results;
  }

  private resolveIcon(summary: IntegrationSummary): string {
    if (summary.SourceType?.IconClass) {
      return summary.SourceType.IconClass;
    }
    const name = summary.Integration.Integration ?? summary.Integration.Name;
    return ResolveIntegrationIcon(name);
  }

  private directionIcon(direction: string): string {
    if (direction === 'Pull') return 'fa-solid fa-arrow-left';
    if (direction === 'Push') return 'fa-solid fa-arrow-right';
    if (direction === 'Bidirectional') return 'fa-solid fa-arrows-left-right';
    return 'fa-solid fa-arrow-right';
  }

  private statusToColor(color: string): string {
    if (color === 'green') return '#059669';
    if (color === 'amber') return '#d97706';
    if (color === 'red') return '#dc2626';
    return '#9ca3af';
  }
}

export function LoadPipelinesComponent(): void {
  // Tree-shaking prevention: importing this module causes
  // @RegisterClass decorators to fire, registering components.
}
