import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
  IntegrationDataService,
  EntityMapRow,
  FieldMapRow
} from '../../services/integration-data.service';
import { IRunViewProvider } from '@memberjunction/core';

// ---------------------------------------------------------------------------
// Visual Editor types (copied from PipelinesComponent)
// ---------------------------------------------------------------------------

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

@Component({
  standalone: false,
  selector: 'app-visual-field-editor',
  templateUrl: './visual-editor.component.html',
  styleUrls: ['./visual-editor.component.css']
})
export class VisualFieldEditorComponent implements OnChanges {

  // ---------------------------------------------------------------------------
  // Inputs / Outputs
  // ---------------------------------------------------------------------------

  @Input() EntityMap: EntityMapRow | null = null;
  @Input() CompanyIntegrationID: string | null = null;
  @Input() RunViewProvider: IRunViewProvider | null = null;
  @Output() Close = new EventEmitter<void>();

  // ---------------------------------------------------------------------------
  // Visual Editor state (copied from PipelinesComponent)
  // ---------------------------------------------------------------------------

  EditorSourceFields: VisualSourceField[] = [];
  EditorDestFields: VisualDestField[] = [];
  EditorConnections: VisualConnection[] = [];
  EditorLoading = false;
  EditorSaving = false;
  EditorSaveSuccess = false;

  SelectedConnectionIdx: number | null = null;
  ConnectingFromSource: string | null = null;

  EditorSearchSource = '';
  EditorSearchDest = '';

  ShowSourcePreview = false;
  ShowDestPreview = false;
  PreviewSourceLoading = false;
  PreviewDestLoading = false;
  PreviewSourceRows: Array<Record<string, string | number | boolean | null>> = [];
  PreviewDestRows: Array<Record<string, string | number | boolean | null>> = [];
  PreviewSourceColumns: string[] = [];
  PreviewDestColumns: string[] = [];

  FieldMapsExpanded = true;
  InfoPanelExpanded = false;

  InfoPanelLoading = false;
  InfoDestRecordCount: number | null = null;
  InfoLastSync: { StartedAt: string | null; EndedAt: string | null; Status: string; TotalRecords: number } | null = null;

  readonly FIELD_HEIGHT = 40;
  readonly SVG_WIDTH = 200;

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

  private dataService = inject(IntegrationDataService);
  private cdr = inject(ChangeDetectorRef);

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['EntityMap'] && this.EntityMap && this.CompanyIntegrationID) {
      this.openEditor();
    }
  }

  // ---------------------------------------------------------------------------
  // Open / Close
  // ---------------------------------------------------------------------------

  private openEditor(): void {
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

  OnClose(): void {
    this.Close.emit();
  }

  // ---------------------------------------------------------------------------
  // SyncEnabled toggle
  // ---------------------------------------------------------------------------

  async OnToggleEditorSyncEnabled(event: Event): Promise<void> {
    if (!this.EntityMap) return;
    const checkbox = event.target as HTMLInputElement;
    const newValue = checkbox.checked;
    this.EntityMap.SyncEnabled = newValue;
    this.cdr.detectChanges();
    try {
      await this.dataService.ToggleEntityMapEnabled(this.EntityMap.ID, newValue);
    } catch (err) {
      this.EntityMap.SyncEnabled = !newValue;
      checkbox.checked = !newValue;
      console.error('[VisualFieldEditor] Failed to toggle SyncEnabled:', err);
      this.cdr.detectChanges();
    }
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  async LoadVisualEditorData(): Promise<void> {
    if (!this.EntityMap || !this.CompanyIntegrationID) return;
    this.EditorLoading = true;
    this.cdr.detectChanges();

    const entityMap = this.EntityMap;

    try {
      const [fieldMaps, destFields] = await Promise.all([
        this.dataService.LoadFieldMaps(entityMap.ID, this.RunViewProvider),
        this.dataService.LoadEntityFields(entityMap.EntityID, this.RunViewProvider)
      ]);

      const sourceFields = this.resolveSourceFieldsFromMetadata(
        this.CompanyIntegrationID,
        entityMap.ExternalObjectName
      );

      if (sourceFields.length > 0) {
        this.EditorSourceFields = sourceFields;
      } else {
        this.EditorSourceFields = fieldMaps.map(fm => ({
          Name: fm.SourceFieldName,
          Label: fm.SourceFieldLabel ?? fm.SourceFieldName,
          Type: '',
          IsRequired: fm.IsRequired,
          IsPrimaryKey: fm.IsKeyField
        }));
      }

      this.EditorDestFields = destFields
        .filter(f => !f.Name.startsWith('__mj'))
        .map(f => ({
          Name: f.Name,
          Type: f.Type,
          IsRequired: f.IsRequired
        }));

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
      console.error('[VisualFieldEditor] Failed to load editor data:', err);
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
    return `conn-${this.getPrimaryTransformType(conn)}`;
  }

  GetConnectionBadgeClass(conn: VisualConnection): string {
    return `badge-${this.getPrimaryTransformType(conn)}`;
  }

  GetConnectionTransformIcon(conn: VisualConnection): string {
    const type = this.getPrimaryTransformType(conn);
    return this.TRANSFORM_TYPES.find(t => t.Value === type)?.Icon ?? 'fa-solid fa-arrow-right';
  }

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
  // Creating connections
  // ---------------------------------------------------------------------------

  OnEditorSourceClick(fieldName: string): void {
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
    if (this.IsDestFieldMapped(fieldName)) return;

    const existing = this.EditorConnections.find(
      c => !c.MarkedForDelete && c.SourceFieldName === this.ConnectingFromSource && c.DestFieldName === fieldName
    );
    if (existing) {
      this.ConnectingFromSource = null;
      return;
    }

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
    if (!this.EntityMap || !this.CompanyIntegrationID) return;
    this.PreviewSourceLoading = true;
    this.cdr.detectChanges();
    try {
      const rows = await this.dataService.PreviewSourceData(
        this.CompanyIntegrationID,
        this.EntityMap.ExternalObjectName,
        5
      );
      this.PreviewSourceRows = rows;
      this.PreviewSourceColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
    } catch (err) {
      console.error('[VisualFieldEditor] Failed to load source preview:', err);
      this.PreviewSourceRows = [];
      this.PreviewSourceColumns = [];
    } finally {
      this.PreviewSourceLoading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadDestPreview(): Promise<void> {
    if (!this.EntityMap) return;
    this.PreviewDestLoading = true;
    this.cdr.detectChanges();
    try {
      const rows = await this.dataService.PreviewDestinationData(
        this.EntityMap.EntityID,
        5,
        this.RunViewProvider
      );
      this.PreviewDestRows = rows;
      this.PreviewDestColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
    } catch (err) {
      console.error('[VisualFieldEditor] Failed to load dest preview:', err);
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
    if (!this.EntityMap || !this.CompanyIntegrationID) return;
    this.InfoPanelLoading = true;
    this.cdr.detectChanges();
    try {
      const [destCount, lastSync] = await Promise.all([
        this.dataService.GetDestinationRecordCount(this.EntityMap.EntityID, this.RunViewProvider),
        this.dataService.GetLastSyncForEntity(
          this.CompanyIntegrationID,
          this.EntityMap.EntityID,
          this.RunViewProvider
        )
      ]);
      this.InfoDestRecordCount = destCount;
      this.InfoLastSync = lastSync;
    } catch (err) {
      console.error('[VisualFieldEditor] Failed to load info panel data:', err);
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
  // Save / Auto-map
  // ---------------------------------------------------------------------------

  get HasEditorChanges(): boolean {
    return this.EditorConnections.some(c => c.IsDirty);
  }

  async SaveVisualEditor(): Promise<void> {
    if (!this.EntityMap) return;
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
            EntityMapID: this.EntityMap.ID,
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
      await this.LoadVisualEditorData();
      this.EditorSaveSuccess = true;
      this.SelectedConnectionIdx = null;
    } catch (err) {
      console.error('[VisualFieldEditor] Failed to save field mappings:', err);
    } finally {
      this.EditorSaving = false;
      this.cdr.detectChanges();
    }
  }

  async AutoMapEditorFields(): Promise<void> {
    if (!this.EntityMap || !this.CompanyIntegrationID) return;
    const destMap = new Map<string, VisualDestField>();
    for (const df of this.EditorDestFields) {
      destMap.set(df.Name.toLowerCase(), df);
    }
    let addedCount = 0;
    for (const sf of this.EditorSourceFields) {
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
  // Computed props
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
}

export function LoadVisualFieldEditorComponent(): void {
  // Tree-shaking prevention
}
