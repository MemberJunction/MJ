import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { RunView, IRunViewProvider } from '@memberjunction/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
  IntegrationDataService,
  ResolveIntegrationIcon,
  IntegrationSummary,
  EntityMapRow,
  FieldMapRow
} from '../../services/integration-data.service';

// ---------------------------------------------------------------------------
// Data interfaces
// ---------------------------------------------------------------------------

interface PipelineCard {
  IntegrationID: string;
  IntegrationName: string;
  Icon: string;
  StatusColor: string;
  StatusLabel: string;
  EntityMapCount: number;
  ActiveMapCount: number;
  UniqueEntityCount: number;
  LastSync: string;
  IsExpanded: boolean;
  EntityMaps: EntityMapRow[];
  /** Filtered subset currently visible */
  FilteredMaps: EntityMapRow[];
  SearchTerm: string;
}

// --- Visual Editor types ---

type TransformType = 'direct' | 'regex' | 'split' | 'combine' | 'lookup' | 'format' | 'coerce' | 'substring' | 'custom';

interface TransformStepUI {
  Type: TransformType;
  Config: Record<string, unknown>;
  OnError: 'Skip' | 'Null' | 'Fail';
}

interface VisualSourceField {
  Name: string;
  Label: string;
  Type: string;
  IsRequired: boolean;
  IsPrimaryKey: boolean;
}

interface VisualDestField {
  Name: string;
  Type: string;
  IsRequired: boolean;
}

interface VisualConnection {
  ID: string | null;
  SourceFieldName: string;
  DestFieldName: string;
  IsKeyField: boolean;
  IsRequired: boolean;
  Direction: 'SourceToDest' | 'DestToSource' | 'Both';
  TransformSteps: TransformStepUI[];
  IsDirty: boolean;
  IsNew: boolean;
  MarkedForDelete: boolean;
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
  // Public state — Card list
  // ---------------------------------------------------------------------------

  PipelineCards: PipelineCard[] = [];
  IsLoading = false;
  GlobalSearch = '';

  // ---------------------------------------------------------------------------
  // Visual Editor state
  // ---------------------------------------------------------------------------

  VisualEditorOpen = false;
  EditorEntityMap: EntityMapRow | null = null;
  EditorCard: PipelineCard | null = null;
  EditorSourceFields: VisualSourceField[] = [];
  EditorDestFields: VisualDestField[] = [];
  EditorConnections: VisualConnection[] = [];
  EditorLoading = false;
  EditorSaving = false;
  EditorSaveSuccess = false;

  /** Currently selected connection index (opens transform panel) */
  SelectedConnectionIdx: number | null = null;

  /** When non-null, user is in "connect mode" — next dest click creates a mapping */
  ConnectingFromSource: string | null = null;

  /** Search/filter within the visual editor columns */
  EditorSearchSource = '';
  EditorSearchDest = '';

  /** Data preview state */
  ShowSourcePreview = false;
  ShowDestPreview = false;
  PreviewSourceLoading = false;
  PreviewDestLoading = false;
  PreviewSourceRows: Array<Record<string, string | number | boolean | null>> = [];
  PreviewDestRows: Array<Record<string, string | number | boolean | null>> = [];
  PreviewSourceColumns: string[] = [];
  PreviewDestColumns: string[] = [];

  /** Collapsible section state */
  FieldMapsExpanded = true;
  InfoPanelExpanded = false;

  /** Info panel data */
  InfoPanelLoading = false;
  InfoDestRecordCount: number | null = null;
  InfoLastSync: { StartedAt: string | null; EndedAt: string | null; Status: string; TotalRecords: number } | null = null;

  /** SVG layout constants */
  readonly FIELD_HEIGHT = 40;
  readonly SVG_WIDTH = 200;

  /** Transform type metadata */
  readonly TRANSFORM_TYPES: Array<{ Value: TransformType; Label: string; Icon: string }> = [
    { Value: 'direct', Label: 'Direct', Icon: 'fa-solid fa-arrow-right' },
    { Value: 'regex', Label: 'Regex', Icon: 'fa-solid fa-code' },
    { Value: 'split', Label: 'Split', Icon: 'fa-solid fa-scissors' },
    { Value: 'combine', Label: 'Combine', Icon: 'fa-solid fa-object-group' },
    { Value: 'lookup', Label: 'Lookup', Icon: 'fa-solid fa-book' },
    { Value: 'format', Label: 'Format', Icon: 'fa-solid fa-font' },
    { Value: 'coerce', Label: 'Coerce', Icon: 'fa-solid fa-exchange-alt' },
    { Value: 'substring', Label: 'Substring', Icon: 'fa-solid fa-text-width' },
    { Value: 'custom', Label: 'Custom', Icon: 'fa-solid fa-wand-magic-sparkles' }
  ];

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
      this.BuildCards(summaries, allEntityMaps);
    } catch (err) {
      console.error('[PipelinesComponent] Failed to load data:', err);
    } finally {
      this.IsLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ---------------------------------------------------------------------------
  // Card building
  // ---------------------------------------------------------------------------

  BuildCards(summaries: IntegrationSummary[], allEntityMaps: EntityMapRow[]): void {
    this.PipelineCards = summaries.map(summary => {
      const maps = allEntityMaps.filter(
        m => UUIDsEqual(m.CompanyIntegrationID, summary.Integration.ID)
      );
      const activeMaps = maps.filter(m => m.SyncEnabled);
      const uniqueEntities = new Set(maps.map(m => m.EntityID)).size;
      return {
        IntegrationID: summary.Integration.ID,
        IntegrationName: summary.Integration.Integration ?? summary.Integration.Name,
        Icon: this.resolveIcon(summary),
        StatusColor: this.statusToColor(summary.StatusColor),
        StatusLabel: this.statusToLabel(summary.StatusColor),
        EntityMapCount: maps.length,
        ActiveMapCount: activeMaps.length,
        UniqueEntityCount: uniqueEntities,
        LastSync: summary.RelativeTime,
        IsExpanded: false,
        EntityMaps: maps,
        FilteredMaps: maps,
        SearchTerm: ''
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Card expand / collapse
  // ---------------------------------------------------------------------------

  ToggleCard(card: PipelineCard): void {
    card.IsExpanded = !card.IsExpanded;
    if (card.IsExpanded) {
      card.FilteredMaps = this.applyMapFilter(card);
    }
  }

  ExpandAll(): void {
    for (const card of this.PipelineCards) {
      card.IsExpanded = true;
      card.FilteredMaps = this.applyMapFilter(card);
    }
  }

  CollapseAll(): void {
    for (const card of this.PipelineCards) {
      card.IsExpanded = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Search / filter
  // ---------------------------------------------------------------------------

  OnCardSearch(card: PipelineCard, event: Event): void {
    const input = event.target as HTMLInputElement;
    card.SearchTerm = input.value;
    card.FilteredMaps = this.applyMapFilter(card);
    this.cdr.detectChanges();
  }

  OnGlobalSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.GlobalSearch = input.value;
    this.cdr.detectChanges();
  }

  get FilteredCards(): PipelineCard[] {
    if (!this.GlobalSearch.trim()) return this.PipelineCards;
    const term = this.GlobalSearch.toLowerCase();
    return this.PipelineCards.filter(card =>
      card.IntegrationName.toLowerCase().includes(term) ||
      card.EntityMaps.some(m =>
        (m.ExternalObjectLabel ?? m.ExternalObjectName).toLowerCase().includes(term) ||
        m.Entity.toLowerCase().includes(term)
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Entity map row click → Open Visual Editor
  // ---------------------------------------------------------------------------

  OnMapRowClick(card: PipelineCard, entityMap: EntityMapRow): void {
    this.OpenVisualEditor(card, entityMap);
  }

  // ---------------------------------------------------------------------------
  // SyncEnabled toggle
  // ---------------------------------------------------------------------------

  async OnToggleSyncEnabled(card: PipelineCard, em: EntityMapRow, event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const newValue = checkbox.checked;
    em.SyncEnabled = newValue;
    card.ActiveMapCount = card.EntityMaps.filter(m => m.SyncEnabled).length;
    this.cdr.detectChanges();
    try {
      await this.dataService.ToggleEntityMapEnabled(em.ID, newValue);
    } catch (err) {
      // Revert on failure
      em.SyncEnabled = !newValue;
      card.ActiveMapCount = card.EntityMaps.filter(m => m.SyncEnabled).length;
      checkbox.checked = !newValue;
      console.error('[PipelinesComponent] Failed to toggle SyncEnabled:', err);
      this.cdr.detectChanges();
    }
  }

  async OnToggleEditorSyncEnabled(event: Event): Promise<void> {
    if (!this.EditorEntityMap || !this.EditorCard) return;
    const checkbox = event.target as HTMLInputElement;
    const newValue = checkbox.checked;
    this.EditorEntityMap.SyncEnabled = newValue;
    this.EditorCard.ActiveMapCount = this.EditorCard.EntityMaps.filter(m => m.SyncEnabled).length;
    this.cdr.detectChanges();
    try {
      await this.dataService.ToggleEntityMapEnabled(this.EditorEntityMap.ID, newValue);
    } catch (err) {
      this.EditorEntityMap.SyncEnabled = !newValue;
      this.EditorCard.ActiveMapCount = this.EditorCard.EntityMaps.filter(m => m.SyncEnabled).length;
      checkbox.checked = !newValue;
      console.error('[PipelinesComponent] Failed to toggle SyncEnabled:', err);
      this.cdr.detectChanges();
    }
  }

  // ---------------------------------------------------------------------------
  // Data preview
  // ---------------------------------------------------------------------------

  async ToggleSourcePreview(): Promise<void> {
    this.ShowSourcePreview = !this.ShowSourcePreview;
    if (this.ShowSourcePreview && this.PreviewSourceRows.length === 0) {
      await this.loadSourcePreview();
    }
    this.cdr.detectChanges();
  }

  async ToggleDestPreview(): Promise<void> {
    this.ShowDestPreview = !this.ShowDestPreview;
    if (this.ShowDestPreview && this.PreviewDestRows.length === 0) {
      await this.loadDestPreview();
    }
    this.cdr.detectChanges();
  }

  private async loadSourcePreview(): Promise<void> {
    if (!this.EditorEntityMap || !this.EditorCard) return;
    this.PreviewSourceLoading = true;
    this.cdr.detectChanges();
    try {
      const rows = await this.dataService.PreviewSourceData(
        this.EditorCard.IntegrationID,
        this.EditorEntityMap.ExternalObjectName,
        5
      );
      this.PreviewSourceRows = rows;
      this.PreviewSourceColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
    } catch (err) {
      console.error('[PipelinesComponent] Failed to load source preview:', err);
      this.PreviewSourceRows = [];
      this.PreviewSourceColumns = [];
    } finally {
      this.PreviewSourceLoading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadDestPreview(): Promise<void> {
    if (!this.EditorEntityMap) return;
    this.PreviewDestLoading = true;
    this.cdr.detectChanges();
    try {
      const rows = await this.dataService.PreviewDestinationData(
        this.EditorEntityMap.EntityID,
        5,
        this.RunViewToUse
      );
      this.PreviewDestRows = rows;
      this.PreviewDestColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
    } catch (err) {
      console.error('[PipelinesComponent] Failed to load dest preview:', err);
      this.PreviewDestRows = [];
      this.PreviewDestColumns = [];
    } finally {
      this.PreviewDestLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ---------------------------------------------------------------------------
  // Collapsible sections
  // ---------------------------------------------------------------------------

  ToggleFieldMaps(): void {
    this.FieldMapsExpanded = !this.FieldMapsExpanded;
    this.cdr.detectChanges();
  }

  ToggleInfoPanel(): void {
    this.InfoPanelExpanded = !this.InfoPanelExpanded;
    if (this.InfoPanelExpanded && this.InfoDestRecordCount === null) {
      this.loadInfoPanelData();
    }
    this.cdr.detectChanges();
  }

  private async loadInfoPanelData(): Promise<void> {
    if (!this.EditorEntityMap || !this.EditorCard) return;
    this.InfoPanelLoading = true;
    this.cdr.detectChanges();
    try {
      const [destCount, lastSync] = await Promise.all([
        this.dataService.GetDestinationRecordCount(this.EditorEntityMap.EntityID, this.RunViewToUse),
        this.dataService.GetLastSyncForEntity(
          this.EditorCard.IntegrationID,
          this.EditorEntityMap.EntityID,
          this.RunViewToUse
        )
      ]);
      this.InfoDestRecordCount = destCount;
      this.InfoLastSync = lastSync;
    } catch (err) {
      console.error('[PipelinesComponent] Failed to load info panel data:', err);
    } finally {
      this.InfoPanelLoading = false;
      this.cdr.detectChanges();
    }
  }

  FormatSyncDate(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  SyncStatusClass(status: string): string {
    switch (status) {
      case 'Success': return 'info-status-success';
      case 'Failed': return 'info-status-error';
      case 'In Progress': return 'info-status-running';
      default: return 'info-status-pending';
    }
  }

  // ---------------------------------------------------------------------------
  // Template helpers
  // ---------------------------------------------------------------------------

  /**
   * Direction arrows for entity-level sync direction.
   * Pull = data flows FROM external source INTO MJ = right arrow (→)
   * Push = data flows FROM MJ OUT to external = left arrow (←)
   */
  DirectionLabel(direction: string): string {
    if (direction === 'Pull') return '\u2192';
    if (direction === 'Push') return '\u2190';
    if (direction === 'Bidirectional') return '\u2194';
    return '\u2192';
  }

  DirectionBadgeClass(direction: string): string {
    if (direction === 'Pull') return 'direction-badge pull';
    if (direction === 'Push') return 'direction-badge push';
    if (direction === 'Bidirectional') return 'direction-badge bidirectional';
    return 'direction-badge';
  }

  DirectionText(direction: string): string {
    if (direction === 'Pull') return 'Pull \u2192';
    if (direction === 'Push') return '\u2190 Push';
    if (direction === 'Bidirectional') return '\u2194 Bi';
    return 'Pull \u2192';
  }

  get IntegrationCount(): number {
    return this.PipelineCards.length;
  }

  get TotalMapCount(): number {
    return this.PipelineCards.reduce((sum, c) => sum + c.EntityMapCount, 0);
  }

  // ===========================================================================
  // VISUAL FIELD MAPPING EDITOR
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // Open / Close
  // ---------------------------------------------------------------------------

  OpenVisualEditor(card: PipelineCard, entityMap: EntityMapRow): void {
    this.EditorCard = card;
    this.EditorEntityMap = entityMap;
    this.VisualEditorOpen = true;
    this.SelectedConnectionIdx = null;
    this.ConnectingFromSource = null;
    this.EditorSearchSource = '';
    this.EditorSearchDest = '';
    this.EditorSaveSuccess = false;
    this.ShowSourcePreview = false;
    this.ShowDestPreview = false;
    this.PreviewSourceRows = [];
    this.PreviewDestRows = [];
    this.PreviewSourceColumns = [];
    this.PreviewDestColumns = [];
    this.FieldMapsExpanded = true;
    this.InfoPanelExpanded = false;
    this.InfoDestRecordCount = null;
    this.InfoLastSync = null;
    this.cdr.detectChanges();
    this.LoadVisualEditorData();
  }

  CloseVisualEditor(): void {
    this.VisualEditorOpen = false;
    this.EditorEntityMap = null;
    this.EditorCard = null;
    this.EditorSourceFields = [];
    this.EditorDestFields = [];
    this.EditorConnections = [];
    this.SelectedConnectionIdx = null;
    this.ConnectingFromSource = null;
    this.cdr.detectChanges();
  }

  async LoadVisualEditorData(): Promise<void> {
    if (!this.EditorEntityMap || !this.EditorCard) return;
    this.EditorLoading = true;
    this.cdr.detectChanges();

    const entityMap = this.EditorEntityMap;

    try {
      // Load field maps and dest fields in parallel
      const [fieldMaps, destFields] = await Promise.all([
        this.dataService.LoadFieldMaps(entityMap.ID, this.RunViewToUse),
        this.dataService.LoadEntityFields(entityMap.EntityID, this.RunViewToUse)
      ]);

      // Build source fields from IntegrationObjectField metadata
      const sourceFields = this.resolveSourceFieldsFromMetadata(
        this.EditorCard.IntegrationID,
        entityMap.ExternalObjectName
      );

      if (sourceFields.length > 0) {
        this.EditorSourceFields = sourceFields;
      } else {
        // Fallback: derive source fields from existing field maps
        this.EditorSourceFields = fieldMaps.map(fm => ({
          Name: fm.SourceFieldName,
          Label: fm.SourceFieldLabel ?? fm.SourceFieldName,
          Type: '',
          IsRequired: fm.IsRequired,
          IsPrimaryKey: fm.IsKeyField
        }));
      }

      // Build dest fields (exclude __mj system fields — they are read-only)
      this.EditorDestFields = destFields
        .filter(f => !f.Name.startsWith('__mj'))
        .map(f => ({
          Name: f.Name,
          Type: f.Type,
          IsRequired: f.IsRequired
        }));

      // Build connections
      this.EditorConnections = fieldMaps
        .filter(fm => fm.Status === 'Active')
        .map(fm => ({
          ID: fm.ID,
          SourceFieldName: fm.SourceFieldName,
          DestFieldName: fm.DestinationFieldName,
          IsKeyField: fm.IsKeyField,
          IsRequired: fm.IsRequired,
          Direction: fm.Direction,
          TransformSteps: this.parseTransformPipeline(fm.TransformPipeline),
          IsDirty: false,
          IsNew: false,
          MarkedForDelete: false
        }));
    } catch (err) {
      console.error('[PipelinesComponent] Failed to load editor data:', err);
    } finally {
      this.EditorLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ---------------------------------------------------------------------------
  // Filtered field lists
  // ---------------------------------------------------------------------------

  get FilteredEditorSourceFields(): VisualSourceField[] {
    if (!this.EditorSearchSource.trim()) return this.EditorSourceFields;
    const term = this.EditorSearchSource.toLowerCase();
    return this.EditorSourceFields.filter(f =>
      f.Name.toLowerCase().includes(term) || f.Label.toLowerCase().includes(term)
    );
  }

  get FilteredEditorDestFields(): VisualDestField[] {
    if (!this.EditorSearchDest.trim()) return this.EditorDestFields;
    const term = this.EditorSearchDest.toLowerCase();
    return this.EditorDestFields.filter(f => f.Name.toLowerCase().includes(term));
  }

  /** Only show connections where both source and dest are visible */
  get VisibleConnections(): VisualConnection[] {
    return this.EditorConnections.filter(c =>
      !c.MarkedForDelete &&
      this.getSourceFieldIndex(c.SourceFieldName) >= 0 &&
      this.getDestFieldIndex(c.DestFieldName) >= 0
    );
  }

  // ---------------------------------------------------------------------------
  // SVG Calculations
  // ---------------------------------------------------------------------------

  get EditorCanvasHeight(): number {
    const sourceHeight = this.FilteredEditorSourceFields.length * this.FIELD_HEIGHT;
    const destHeight = this.FilteredEditorDestFields.length * this.FIELD_HEIGHT;
    return Math.max(sourceHeight, destHeight, 200);
  }

  GetConnectionPath(conn: VisualConnection): string {
    const sourceY = this.getSourceFieldY(conn.SourceFieldName);
    const destY = this.getDestFieldY(conn.DestFieldName);
    if (sourceY < 0 || destY < 0) return '';
    const cp1x = this.SVG_WIDTH * 0.35;
    const cp2x = this.SVG_WIDTH * 0.65;
    return `M 0 ${sourceY} C ${cp1x} ${sourceY}, ${cp2x} ${destY}, ${this.SVG_WIDTH} ${destY}`;
  }

  GetConnectionMidY(conn: VisualConnection): number {
    const sourceY = this.getSourceFieldY(conn.SourceFieldName);
    const destY = this.getDestFieldY(conn.DestFieldName);
    return (sourceY + destY) / 2;
  }

  GetConnectionLineClass(conn: VisualConnection): string {
    const type = this.getPrimaryTransformType(conn);
    return `conn-${type}`;
  }

  GetConnectionBadgeClass(conn: VisualConnection): string {
    const type = this.getPrimaryTransformType(conn);
    return `badge-${type}`;
  }

  GetConnectionTransformIcon(conn: VisualConnection): string {
    const type = this.getPrimaryTransformType(conn);
    return this.TRANSFORM_TYPES.find(t => t.Value === type)?.Icon ?? 'fa-solid fa-arrow-right';
  }

  /** Direction-aware icon for the SVG connection badge */
  GetConnectionDirectionIcon(conn: VisualConnection): string {
    switch (conn.Direction) {
      case 'DestToSource': return 'fa-solid fa-arrow-left';
      case 'Both': return 'fa-solid fa-right-left';
      default: return 'fa-solid fa-arrow-right';
    }
  }

  GetTransformTypeLabel(type: TransformType): string {
    return this.TRANSFORM_TYPES.find(t => t.Value === type)?.Label ?? type;
  }

  // ---------------------------------------------------------------------------
  // Field mapped state
  // ---------------------------------------------------------------------------

  IsSourceFieldMapped(fieldName: string): boolean {
    return this.EditorConnections.some(c => !c.MarkedForDelete && c.SourceFieldName === fieldName);
  }

  IsDestFieldMapped(fieldName: string): boolean {
    return this.EditorConnections.some(c => !c.MarkedForDelete && c.DestFieldName === fieldName);
  }

  // ---------------------------------------------------------------------------
  // Creating connections (click source → click dest)
  // ---------------------------------------------------------------------------

  OnEditorSourceClick(fieldName: string): void {
    // Don't allow starting a new connection from an already-mapped field
    if (this.IsSourceFieldMapped(fieldName)) return;

    if (this.ConnectingFromSource === fieldName) {
      this.ConnectingFromSource = null;
    } else {
      this.ConnectingFromSource = fieldName;
      this.SelectedConnectionIdx = null;
    }
    this.cdr.detectChanges();
  }

  OnEditorDestClick(fieldName: string): void {
    if (!this.ConnectingFromSource) return;

    // Don't allow mapping to an already-mapped dest field
    if (this.IsDestFieldMapped(fieldName)) return;

    // Check if this mapping already exists
    const existing = this.EditorConnections.find(
      c => !c.MarkedForDelete && c.SourceFieldName === this.ConnectingFromSource && c.DestFieldName === fieldName
    );
    if (existing) {
      this.ConnectingFromSource = null;
      return;
    }

    // Create new connection
    this.EditorConnections.push({
      ID: null,
      SourceFieldName: this.ConnectingFromSource,
      DestFieldName: fieldName,
      IsKeyField: false,
      IsRequired: false,
      Direction: 'SourceToDest',
      TransformSteps: [{ Type: 'direct', Config: {}, OnError: 'Fail' }],
      IsDirty: true,
      IsNew: true,
      MarkedForDelete: false
    });

    this.ConnectingFromSource = null;
    this.SelectedConnectionIdx = this.EditorConnections.length - 1;
    this.cdr.detectChanges();
  }

  CancelConnect(): void {
    this.ConnectingFromSource = null;
    this.cdr.detectChanges();
  }

  // ---------------------------------------------------------------------------
  // Connection selection / editing
  // ---------------------------------------------------------------------------

  SelectConnection(index: number, event: Event): void {
    event.stopPropagation();
    this.SelectedConnectionIdx = this.SelectedConnectionIdx === index ? null : index;
    this.ConnectingFromSource = null;
    this.cdr.detectChanges();
  }

  DeselectConnection(): void {
    this.SelectedConnectionIdx = null;
    this.cdr.detectChanges();
  }

  get SelectedConnection(): VisualConnection | null {
    if (this.SelectedConnectionIdx == null) return null;
    return this.EditorConnections[this.SelectedConnectionIdx] ?? null;
  }

  RemoveSelectedConnection(): void {
    if (this.SelectedConnectionIdx == null) return;
    const conn = this.EditorConnections[this.SelectedConnectionIdx];
    if (conn.IsNew) {
      this.EditorConnections.splice(this.SelectedConnectionIdx, 1);
    } else {
      conn.MarkedForDelete = true;
      conn.IsDirty = true;
    }
    this.SelectedConnectionIdx = null;
    this.cdr.detectChanges();
  }

  ToggleConnectionKey(): void {
    const conn = this.SelectedConnection;
    if (!conn) return;
    conn.IsKeyField = !conn.IsKeyField;
    conn.IsDirty = true;
    this.cdr.detectChanges();
  }

  ToggleConnectionRequired(): void {
    const conn = this.SelectedConnection;
    if (!conn) return;
    conn.IsRequired = !conn.IsRequired;
    conn.IsDirty = true;
    this.cdr.detectChanges();
  }

  GetDirectionArrowClass(direction: string): string {
    switch (direction) {
      case 'DestToSource': return 'fa-arrow-left';
      case 'Both': return 'fa-right-left';
      default: return 'fa-arrow-right';
    }
  }

  OnConnectionDirectionChange(direction: 'SourceToDest' | 'DestToSource' | 'Both'): void {
    const conn = this.SelectedConnection;
    if (!conn) return;
    conn.Direction = direction;
    conn.IsDirty = true;
    this.cdr.detectChanges();
  }

  OnConnectionTransformChange(stepIndex: number, type: TransformType): void {
    const conn = this.SelectedConnection;
    if (!conn || !conn.TransformSteps[stepIndex]) return;
    conn.TransformSteps[stepIndex].Type = type;
    conn.TransformSteps[stepIndex].Config = this.getDefaultConfigForType(type);
    conn.IsDirty = true;
    this.cdr.detectChanges();
  }

  OnTransformConfigChange(conn: VisualConnection, stepIndex: number, key: string, value: string): void {
    if (!conn.TransformSteps[stepIndex]) return;
    conn.TransformSteps[stepIndex].Config[key] = value;
    conn.IsDirty = true;
  }

  AddTransformStep(): void {
    const conn = this.SelectedConnection;
    if (!conn) return;
    conn.TransformSteps.push({ Type: 'direct', Config: {}, OnError: 'Fail' });
    conn.IsDirty = true;
    this.cdr.detectChanges();
  }

  RemoveTransformStep(stepIndex: number): void {
    const conn = this.SelectedConnection;
    if (!conn) return;
    conn.TransformSteps.splice(stepIndex, 1);
    conn.IsDirty = true;
    this.cdr.detectChanges();
  }

  // ---------------------------------------------------------------------------
  // Save / Auto-map
  // ---------------------------------------------------------------------------

  get HasEditorChanges(): boolean {
    return this.EditorConnections.some(c => c.IsDirty);
  }

  async SaveVisualEditor(): Promise<void> {
    if (!this.EditorEntityMap) return;
    this.EditorSaving = true;
    this.EditorSaveSuccess = false;
    this.cdr.detectChanges();

    try {
      for (const conn of this.EditorConnections) {
        if (!conn.IsDirty) continue;

        if (conn.MarkedForDelete && conn.ID) {
          await this.dataService.DeleteFieldMap(conn.ID);
        } else if (conn.IsNew && !conn.MarkedForDelete) {
          await this.dataService.CreateFieldMap({
            EntityMapID: this.EditorEntityMap.ID,
            SourceFieldName: conn.SourceFieldName,
            DestinationFieldName: conn.DestFieldName,
            IsKeyField: conn.IsKeyField,
            IsRequired: conn.IsRequired,
            Direction: conn.Direction,
            TransformPipeline: this.serializeTransformPipeline(conn.TransformSteps)
          });
        } else if (conn.ID && !conn.MarkedForDelete) {
          await this.dataService.UpdateFieldMap(conn.ID, {
            SourceFieldName: conn.SourceFieldName,
            DestinationFieldName: conn.DestFieldName,
            IsKeyField: conn.IsKeyField,
            IsRequired: conn.IsRequired,
            Direction: conn.Direction,
            TransformPipeline: this.serializeTransformPipeline(conn.TransformSteps)
          });
        }
      }

      // Reload to get clean state
      await this.LoadVisualEditorData();
      this.EditorSaveSuccess = true;
      this.SelectedConnectionIdx = null;
    } catch (err) {
      console.error('[PipelinesComponent] Failed to save field mappings:', err);
    } finally {
      this.EditorSaving = false;
      this.cdr.detectChanges();
    }
  }

  async AutoMapEditorFields(): Promise<void> {
    if (!this.EditorEntityMap || !this.EditorCard) return;

    // Match source to dest by name (case-insensitive)
    const destMap = new Map<string, VisualDestField>();
    for (const df of this.EditorDestFields) {
      destMap.set(df.Name.toLowerCase(), df);
    }

    let addedCount = 0;
    for (const sf of this.EditorSourceFields) {
      // Skip if already mapped
      if (this.IsSourceFieldMapped(sf.Name)) continue;
      const destMatch = destMap.get(sf.Name.toLowerCase());
      if (!destMatch) continue;
      if (this.IsDestFieldMapped(destMatch.Name)) continue;

      this.EditorConnections.push({
        ID: null,
        SourceFieldName: sf.Name,
        DestFieldName: destMatch.Name,
        IsKeyField: sf.IsPrimaryKey,
        IsRequired: sf.IsRequired || destMatch.IsRequired,
        Direction: 'SourceToDest',
        TransformSteps: [{ Type: 'direct', Config: {}, OnError: 'Fail' }],
        IsDirty: true,
        IsNew: true,
        MarkedForDelete: false
      });
      addedCount++;
    }

    if (addedCount > 0) {
      this.cdr.detectChanges();
    }
  }

  // ---------------------------------------------------------------------------
  // Editor computed props
  // ---------------------------------------------------------------------------

  get EditorMappedCount(): number {
    return this.EditorConnections.filter(c => !c.MarkedForDelete).length;
  }

  get EditorKeyFieldCount(): number {
    return this.EditorConnections.filter(c => !c.MarkedForDelete && c.IsKeyField).length;
  }

  get EditorRequiredCount(): number {
    return this.EditorConnections.filter(c => !c.MarkedForDelete && c.IsRequired).length;
  }

  /** Get transform config keys for inline editing */
  GetConfigKeys(step: TransformStepUI): string[] {
    return Object.keys(step.Config);
  }

  GetConfigValue(step: TransformStepUI, key: string): string {
    const val = step.Config[key];
    if (val == null) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getSourceFieldIndex(fieldName: string): number {
    return this.FilteredEditorSourceFields.findIndex(f => f.Name === fieldName);
  }

  private getDestFieldIndex(fieldName: string): number {
    return this.FilteredEditorDestFields.findIndex(f => f.Name === fieldName);
  }

  private getSourceFieldY(fieldName: string): number {
    const idx = this.getSourceFieldIndex(fieldName);
    if (idx < 0) return -1;
    return idx * this.FIELD_HEIGHT + this.FIELD_HEIGHT / 2;
  }

  private getDestFieldY(fieldName: string): number {
    const idx = this.getDestFieldIndex(fieldName);
    if (idx < 0) return -1;
    return idx * this.FIELD_HEIGHT + this.FIELD_HEIGHT / 2;
  }

  private getPrimaryTransformType(conn: VisualConnection): TransformType {
    if (conn.TransformSteps.length === 0) return 'direct';
    return conn.TransformSteps[0].Type;
  }

  private parseTransformPipeline(json: string | null): TransformStepUI[] {
    if (!json || json.trim() === '') return [];
    try {
      const parsed: unknown = JSON.parse(json);
      if (!Array.isArray(parsed)) return [];
      return (parsed as TransformStepUI[]).map(step => ({
        Type: step.Type ?? 'direct',
        Config: (step.Config as Record<string, unknown>) ?? {},
        OnError: step.OnError ?? 'Fail'
      }));
    } catch {
      return [];
    }
  }

  private serializeTransformPipeline(steps: TransformStepUI[]): string | null {
    if (steps.length === 0) return null;
    return JSON.stringify(steps.map(s => ({ Type: s.Type, Config: s.Config, OnError: s.OnError })));
  }

  private getDefaultConfigForType(type: TransformType): Record<string, unknown> {
    switch (type) {
      case 'direct': return {};
      case 'regex': return { Pattern: '', Replacement: '', Flags: 'g' };
      case 'split': return { Delimiter: ',', Index: 0 };
      case 'combine': return { SourceFields: [], Separator: ' ' };
      case 'lookup': return { Map: {}, Default: '' };
      case 'format': return { FormatString: '', FormatType: 'date' };
      case 'coerce': return { TargetType: 'string' };
      case 'substring': return { Start: 0, Length: 10 };
      case 'custom': return { Expression: 'value' };
    }
  }

  /**
   * Resolve source fields from IntegrationObjectField metadata via IntegrationEngineBase.
   * CompanyIntegrationID → Integration → IntegrationObject → IntegrationObjectFields.
   */
  private resolveSourceFieldsFromMetadata(
    companyIntegrationID: string,
    externalObjectName: string
  ): VisualSourceField[] {
    const engine = IntegrationEngineBase.Instance;
    const integration = engine.GetIntegrationForCompanyIntegration(companyIntegrationID);
    if (!integration) return [];

    const obj = engine.GetIntegrationObject(integration.ID, externalObjectName);
    if (!obj) return [];

    const fields = engine.GetIntegrationObjectFields(obj.ID);
    return fields
      .filter(f => f.Status === 'Active')
      .sort((a, b) => a.Sequence - b.Sequence)
      .map(f => ({
        Name: f.Name,
        Label: f.DisplayName || f.Name,
        Type: f.Type,
        IsRequired: f.IsRequired,
        IsPrimaryKey: f.IsPrimaryKey
      }));
  }

  private applyMapFilter(card: PipelineCard): EntityMapRow[] {
    if (!card.SearchTerm.trim()) return card.EntityMaps;
    const term = card.SearchTerm.toLowerCase();
    return card.EntityMaps.filter(m =>
      (m.ExternalObjectLabel ?? m.ExternalObjectName).toLowerCase().includes(term) ||
      m.Entity.toLowerCase().includes(term)
    );
  }

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

  private statusToColor(color: string): string {
    if (color === 'green') return '#059669';
    if (color === 'amber') return '#d97706';
    if (color === 'red') return '#dc2626';
    return '#9ca3af';
  }

  private statusToLabel(color: string): string {
    if (color === 'green') return 'Healthy';
    if (color === 'amber') return 'Warning';
    if (color === 'red') return 'Error';
    return 'Inactive';
  }
}

export function LoadPipelinesComponent(): void {
  // Tree-shaking prevention: importing this module causes
  // @RegisterClass decorators to fire, registering components.
}
