import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, MJIntegrationObjectFieldEntity, MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
  IntegrationDataService,
  IntegrationRunRow,
  EntityMapRow,
  FieldMapRow,
  RunDetailRow
} from '../../services/integration-data.service';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Source object from integration metadata */
interface DiscoveredObject {
  Name: string;
  Label: string;
  Category: string;
  Description: string;
  SupportsIncrementalSync: boolean;
  SupportsWrite: boolean;
}

/** Target MJ entity for the picker */
interface MJEntityOption {
  ID: string;
  Name: string;
}

/** MJ entity field for field mapping destination picker */
interface MJFieldOption {
  ID: string;
  Name: string;
  Type: string;
  IsRequired: boolean;
}

/** Transform type for the pipeline builder */
type TransformType = 'direct' | 'regex' | 'split' | 'combine' | 'lookup' | 'format' | 'coerce' | 'substring' | 'custom';

/** A single step in a transform pipeline */
interface TransformStepUI {
  Type: TransformType;
  Config: Record<string, unknown>;
  OnError: 'Skip' | 'Null' | 'Fail';
}

/** Editable field map row used in the center panel */
interface EditableFieldMap {
  ID: string | null;
  SourceFieldName: string;
  SourceFieldLabel: string;
  SourceFieldType: string;
  DestinationFieldName: string;
  DestinationFieldLabel: string;
  IsKeyField: boolean;
  IsRequired: boolean;
  Direction: 'Both' | 'DestToSource' | 'SourceToDest';
  Status: 'Active' | 'Inactive';
  IsNew: boolean;
  IsDirty: boolean;
  // Source metadata (from connector discovery)
  IsSourcePK: boolean;
  IsSourceRequired: boolean;
  IsSourceReadOnly: boolean;
  // Transform pipeline
  TransformPipeline: TransformStepUI[];
  ShowTransformEditor: boolean;
}

/** Pending entity map — entity hasn't been created yet */
interface PendingMapEntry {
  LocalID: string;
  SourceObjectName: string;
  SourceObjectLabel: string;
  SchemaName: string;
  TableName: string;
  EntityName: string;
  SyncDirection: 'Bidirectional' | 'Pull' | 'Push';
  SourceFields: MJIntegrationObjectFieldEntity[];
  DDLContent: string;
  CreatedAt: Date;
}

/** Combined list item for left panel — merges real and pending maps */
interface MapListItem {
  ID: string;
  SourceName: string;
  TargetName: string;
  SyncDirection: string;
  SyncEnabled: boolean;
  IsPending: boolean;
  RealMap: EntityMapRow | null;
  PendingMap: PendingMapEntry | null;
}

type TargetMode = 'existing' | 'new';

/** Data preview row — key/value record */
type PreviewRecord = Record<string, string | number | boolean | null>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@RegisterClass(BaseResourceComponent, 'IntegrationMappingWorkspace')
@Component({
  standalone: false,
  selector: 'app-mapping-workspace',
  templateUrl: './mapping-workspace.component.html',
  styleUrls: ['./mapping-workspace.component.css']
})
export class MappingWorkspaceComponent extends BaseResourceComponent implements OnInit {

  // --- Core data ---
  Integrations: MJCompanyIntegrationEntity[] = [];
  EntityMaps: EntityMapRow[] = [];
  FieldMaps: FieldMapRow[] = [];
  RunEntityDetails: RunDetailRow[] = [];
  LatestRun: IntegrationRunRow | null = null;

  // --- Selection ---
  SelectedIntegrationID = '';
  SelectedMapID: string | null = null;
  EntityMapSearchText = '';

  // --- Loading ---
  IsLoadingIntegrations = false;
  IsLoadingEntityMaps = false;
  IsLoadingFieldMaps = false;
  IsLoadingRunDetails = false;

  // --- Add Map flow ---
  ShowAddPanel = false;
  TargetMode: TargetMode = 'existing';

  // Source objects from discovery
  DiscoveredObjects: DiscoveredObject[] = [];
  IsDiscoveringObjects = false;
  DiscoverError = '';
  SelectedSourceObjectName = '';

  // Target: existing entity
  MJEntities: MJEntityOption[] = [];
  IsLoadingEntities = false;
  SelectedEntityID: string | null = null;

  // Target: new entity
  NewEntitySchemaName = '';
  NewEntityTableName = '';
  NewEntityName = '';
  DBSchemas: string[] = [];

  // Sync direction for add flow
  AddSyncDirection: 'Bidirectional' | 'Pull' | 'Push' = 'Pull';
  IsSavingEntityMap = false;

  // --- Pending entity maps (local state) ---
  PendingMaps: PendingMapEntry[] = [];

  // --- DDL preview ---
  IsGeneratingDDL = false;
  DDLPreviewContent = '';
  DDLPreviewError = '';

  // --- Field mapping editing ---
  EditableFields: EditableFieldMap[] = [];
  DestinationFields: MJFieldOption[] = [];
  IsLoadingDestFields = false;
  IsSavingFields = false;
  AutoMapCount = 0;
  ShowAutoMapBanner = false;

  // --- Source fields for auto-mapping ---
  SourceFields: MJIntegrationObjectFieldEntity[] = [];
  IsLoadingSourceFields = false;

  // --- Data preview ---
  SourcePreviewData: PreviewRecord[] = [];
  DestPreviewData: PreviewRecord[] = [];
  IsLoadingSourcePreview = false;
  IsLoadingDestPreview = false;
  ShowSourcePreview = false;
  ShowDestPreview = false;

  private dataService = inject(IntegrationDataService);
  private cdr = inject(ChangeDetectorRef);
  private discoverCache = new Map<string, DiscoveredObject[]>();
  private pendingCounter = 0;

  async ngOnInit(): Promise<void> {
    await this.LoadIntegrations();
  }

  // =====================================================================
  // Computed Properties
  // =====================================================================

  /** Merged list of real entity maps + pending maps, for the left panel */
  get AllMaps(): MapListItem[] {
    const realItems: MapListItem[] = this.EntityMaps.map(em => ({
      ID: em.ID,
      SourceName: em.ExternalObjectName,
      TargetName: em.Entity,
      SyncDirection: em.SyncDirection,
      SyncEnabled: em.SyncEnabled,
      IsPending: false,
      RealMap: em,
      PendingMap: null
    }));

    const pendingItems: MapListItem[] = this.PendingMaps.map(pm => ({
      ID: pm.LocalID,
      SourceName: pm.SourceObjectName,
      TargetName: pm.EntityName,
      SyncDirection: pm.SyncDirection,
      SyncEnabled: false,
      IsPending: true,
      RealMap: null,
      PendingMap: pm
    }));

    return [...realItems, ...pendingItems];
  }

  get FilteredMaps(): MapListItem[] {
    const all = this.AllMaps;
    if (!this.EntityMapSearchText.trim()) return all;
    const search = this.EntityMapSearchText.toLowerCase();
    return all.filter(
      m => m.SourceName.toLowerCase().includes(search)
        || m.TargetName.toLowerCase().includes(search)
    );
  }

  get SelectedMap(): MapListItem | null {
    if (!this.SelectedMapID) return null;
    return this.AllMaps.find(m => UUIDsEqual(m.ID, this.SelectedMapID)) ?? null;
  }

  get SelectedEntityMap(): EntityMapRow | null {
    const map = this.SelectedMap;
    return map?.RealMap ?? null;
  }

  get SelectedPendingMap(): PendingMapEntry | null {
    const map = this.SelectedMap;
    return map?.PendingMap ?? null;
  }

  get HasDirtyFields(): boolean {
    return this.EditableFields.some(f => f.IsDirty || f.IsNew);
  }

  get ActiveEditableFields(): EditableFieldMap[] {
    return this.EditableFields.filter(f => f.Status !== 'Inactive');
  }

  get IsAddFormValid(): boolean {
    if (!this.SelectedSourceObjectName) return false;
    if (this.TargetMode === 'existing') return !!this.SelectedEntityID;
    return !!this.NewEntitySchemaName.trim() && !!this.NewEntityTableName.trim() && !!this.NewEntityName.trim();
  }

  /** Auto-suggest table/entity names from selected source object */
  get SuggestedTableName(): string {
    if (!this.SelectedSourceObjectName) return '';
    return this.SelectedSourceObjectName.replace(/[^A-Za-z0-9_]/g, '_');
  }

  get SuggestedEntityName(): string {
    if (!this.SelectedSourceObjectName) return '';
    const obj = this.DiscoveredObjects.find(o => o.Name === this.SelectedSourceObjectName);
    const label = obj?.Label || this.SelectedSourceObjectName;
    if (this.NewEntitySchemaName) return `${this.NewEntitySchemaName} ${label}`;
    return label;
  }

  // =====================================================================
  // Data Loading
  // =====================================================================

  async LoadIntegrations(): Promise<void> {
    this.IsLoadingIntegrations = true;
    this.cdr.detectChanges();
    try {
      const summaries = await this.dataService.LoadIntegrationSummaries(this.RunViewToUse);
      this.Integrations = summaries.map(s => s.Integration);
    } finally {
      this.IsLoadingIntegrations = false;
      this.cdr.detectChanges();
    }
  }

  async OnIntegrationChange(integrationID: string): Promise<void> {
    this.SelectedIntegrationID = integrationID;
    this.SelectedMapID = null;
    this.FieldMaps = [];
    this.EditableFields = [];
    this.DestinationFields = [];
    this.RunEntityDetails = [];
    this.LatestRun = null;
    this.EntityMapSearchText = '';
    this.CloseAddPanel();
    this.CloseAllPreviews();

    if (!integrationID) return;

    // Load entity maps + latest run in parallel, and auto-discover source objects
    await Promise.all([
      this.LoadEntityMapsForIntegration(integrationID),
      this.LoadLatestRunForIntegration(integrationID),
      this.DiscoverSourceObjects(integrationID)
    ]);
  }

  private async LoadEntityMapsForIntegration(integrationID: string): Promise<void> {
    this.IsLoadingEntityMaps = true;
    this.cdr.detectChanges();
    try {
      this.EntityMaps = await this.dataService.LoadEntityMaps(integrationID, this.RunViewToUse);
    } finally {
      this.IsLoadingEntityMaps = false;
      this.cdr.detectChanges();
    }
  }

  private async LoadLatestRunForIntegration(integrationID: string): Promise<void> {
    this.IsLoadingRunDetails = true;
    this.cdr.detectChanges();
    try {
      const runs = await this.dataService.LoadRunHistory(integrationID, 1, this.RunViewToUse);
      this.LatestRun = runs.length > 0 ? runs[0] : null;
      if (this.LatestRun) {
        this.RunEntityDetails = await this.dataService.LoadRunDetails(this.LatestRun.ID, this.RunViewToUse);
      }
    } finally {
      this.IsLoadingRunDetails = false;
      this.cdr.detectChanges();
    }
  }

  /** Load source objects from IntegrationObject metadata via engine (cached per integration) */
  private DiscoverSourceObjects(integrationID: string): Promise<void> {
    if (this.discoverCache.has(integrationID)) {
      this.DiscoveredObjects = this.discoverCache.get(integrationID)!;
      return Promise.resolve();
    }

    this.IsDiscoveringObjects = true;
    this.DiscoverError = '';
    this.DiscoveredObjects = [];
    this.cdr.detectChanges();

    try {
      const engine = IntegrationEngineBase.Instance;
      const integration = engine.GetIntegrationForCompanyIntegration(integrationID);
      if (!integration) {
        this.DiscoverError = 'Integration not found in metadata';
        return Promise.resolve();
      }

      const objects = engine.GetActiveIntegrationObjects(integration.ID);
      this.DiscoveredObjects = objects.map(o => ({
        Name: o.Name,
        Label: o.DisplayName || o.Name,
        Category: o.Category || 'Uncategorized',
        Description: o.Description || '',
        SupportsIncrementalSync: o.SupportsIncrementalSync,
        SupportsWrite: o.SupportsWrite
      }));
      this.discoverCache.set(integrationID, this.DiscoveredObjects);
    } catch (e) {
      this.DiscoverError = `Failed to load objects: ${(e as Error).message}`;
    } finally {
      this.IsDiscoveringObjects = false;
      this.cdr.detectChanges();
    }
    return Promise.resolve();
  }

  // =====================================================================
  // Entity Map Selection
  // =====================================================================

  async OnMapSelect(item: MapListItem): Promise<void> {
    this.SelectedMapID = item.ID;
    this.CloseAllPreviews();

    if (item.IsPending) {
      // Pending maps show the pending entity view in center panel
      this.EditableFields = [];
      this.DestinationFields = [];
      this.cdr.detectChanges();
      return;
    }

    // Real entity map — load field maps + dest fields, resolve source from metadata
    this.IsLoadingFieldMaps = true;
    this.cdr.detectChanges();
    try {
      await Promise.all([
        this.dataService.LoadFieldMaps(item.ID, this.RunViewToUse).then(fms => { this.FieldMaps = fms; }),
        this.LoadDestinationFields(item.RealMap!.EntityID)
      ]);

      // Resolve source fields from IntegrationObject metadata
      this.SourceFields = this.resolveSourceFieldsFromMetadata(
        this.SelectedIntegrationID,
        item.RealMap!.ExternalObjectName
      );

      this.EditableFields = this.FieldMaps.map(fm => this.ToEditableField(fm));
    } finally {
      this.IsLoadingFieldMaps = false;
      this.cdr.detectChanges();
    }
  }

  IsSelectedMap(id: string): boolean {
    return this.SelectedMapID === id || UUIDsEqual(this.SelectedMapID, id);
  }

  async OnToggleEntityMap(em: EntityMapRow): Promise<void> {
    await this.dataService.ToggleEntityMapEnabled(em.ID, em.SyncEnabled);
  }

  async OnDeleteMap(item: MapListItem, event: Event): Promise<void> {
    event.stopPropagation();
    if (item.IsPending) {
      this.PendingMaps = this.PendingMaps.filter(p => p.LocalID !== item.ID);
    } else {
      const deleted = await this.dataService.DeleteEntityMap(item.ID);
      if (deleted) {
        this.EntityMaps = this.EntityMaps.filter(e => !UUIDsEqual(e.ID, item.ID));
      }
    }

    if (this.IsSelectedMap(item.ID)) {
      this.SelectedMapID = null;
      this.EditableFields = [];
      this.DestinationFields = [];
    }
    this.cdr.detectChanges();
  }

  // =====================================================================
  // Add Map Flow
  // =====================================================================

  OpenAddPanel(): void {
    this.ShowAddPanel = true;
    this.TargetMode = 'existing';
    this.ResetAddForm();
    this.EnsureEntitiesLoaded();
    this.LoadDBSchemas();
  }

  CloseAddPanel(): void {
    this.ShowAddPanel = false;
    this.ResetAddForm();
  }

  SetTargetMode(mode: TargetMode): void {
    this.TargetMode = mode;
  }

  OnSourceObjectChange(objectName: string): void {
    this.SelectedSourceObjectName = objectName;
    // Auto-suggest table/entity name for new entity mode
    if (this.TargetMode === 'new') {
      this.NewEntityTableName = this.SuggestedTableName;
      this.NewEntityName = this.SuggestedEntityName;
    }
  }

  OnSchemaNameChange(): void {
    // Update entity name suggestion when schema changes
    if (this.SelectedSourceObjectName) {
      this.NewEntityName = this.SuggestedEntityName;
    }
  }

  async SaveAddMap(): Promise<void> {
    if (!this.IsAddFormValid || !this.SelectedIntegrationID) return;
    this.IsSavingEntityMap = true;
    this.cdr.detectChanges();

    try {
      if (this.TargetMode === 'existing') {
        await this.SaveExistingEntityMap();
      } else {
        await this.SaveNewEntityMap();
      }
    } finally {
      this.IsSavingEntityMap = false;
      this.cdr.detectChanges();
    }
  }

  private async SaveExistingEntityMap(): Promise<void> {
    const sourceObj = this.DiscoveredObjects.find(o => o.Name === this.SelectedSourceObjectName);
    const result = await this.dataService.CreateEntityMap({
      CompanyIntegrationID: this.SelectedIntegrationID,
      ExternalObjectName: this.SelectedSourceObjectName,
      ExternalObjectLabel: sourceObj?.Label !== sourceObj?.Name ? sourceObj?.Label : undefined,
      EntityID: this.SelectedEntityID!,
      SyncDirection: this.AddSyncDirection
    });

    if (result) {
      // Reload entity maps and auto-generate field mappings
      await this.LoadEntityMapsForIntegration(this.SelectedIntegrationID);
      const newMap = this.EntityMaps.find(
        em => em.ExternalObjectName === this.SelectedSourceObjectName
      );
      if (newMap) {
        this.SelectedMapID = newMap.ID;
        await this.AutoGenerateFieldMappings(newMap);
      }
      this.CloseAddPanel();
    }
  }

  private async SaveNewEntityMap(): Promise<void> {
    // Resolve source fields from IntegrationObject metadata
    const sourceFields = this.resolveSourceFieldsFromMetadata(
      this.SelectedIntegrationID,
      this.SelectedSourceObjectName
    );

    // Generate DDL preview
    let ddlContent = '';
    try {
      const ddlResult = await this.dataService.SchemaPreview(
        this.SelectedIntegrationID,
        [{
          SourceObjectName: this.SelectedSourceObjectName,
          SchemaName: this.NewEntitySchemaName.trim(),
          TableName: this.NewEntityTableName.trim(),
          EntityName: this.NewEntityName.trim()
        }],
        'sqlserver'
      );
      if (ddlResult.Success && ddlResult.Files.length > 0) {
        ddlContent = ddlResult.Files.map(f => f.Content).join('\n\n');
      }
    } catch {
      // DDL will be empty — not a blocker
    }

    // Create pending map entry
    const pendingMap: PendingMapEntry = {
      LocalID: `pending-${++this.pendingCounter}`,
      SourceObjectName: this.SelectedSourceObjectName,
      SourceObjectLabel: this.DiscoveredObjects.find(o => o.Name === this.SelectedSourceObjectName)?.Label || this.SelectedSourceObjectName,
      SchemaName: this.NewEntitySchemaName.trim(),
      TableName: this.NewEntityTableName.trim(),
      EntityName: this.NewEntityName.trim(),
      SyncDirection: this.AddSyncDirection,
      SourceFields: sourceFields,
      DDLContent: ddlContent,
      CreatedAt: new Date()
    };

    this.PendingMaps.push(pendingMap);
    this.SelectedMapID = pendingMap.LocalID;
    this.CloseAddPanel();
  }

  private ResetAddForm(): void {
    this.SelectedSourceObjectName = '';
    this.SelectedEntityID = null;
    this.NewEntitySchemaName = '';
    this.NewEntityTableName = '';
    this.NewEntityName = '';
    this.AddSyncDirection = 'Pull';
    this.DDLPreviewContent = '';
    this.DDLPreviewError = '';
  }

  private async EnsureEntitiesLoaded(): Promise<void> {
    if (this.MJEntities.length > 0) return;
    this.IsLoadingEntities = true;
    this.cdr.detectChanges();
    try {
      this.MJEntities = await this.dataService.LoadMJEntities(this.RunViewToUse);
    } finally {
      this.IsLoadingEntities = false;
      this.cdr.detectChanges();
    }
  }

  private LoadDBSchemas(): void {
    if (this.DBSchemas.length > 0) return;
    const md = new Metadata();
    const schemaSet = new Set<string>();
    for (const entity of md.Entities) {
      if (entity.SchemaName) {
        schemaSet.add(entity.SchemaName);
      }
    }
    this.DBSchemas = Array.from(schemaSet).sort();
  }

  // =====================================================================
  // DDL Preview for Add Panel
  // =====================================================================

  async PreviewDDL(): Promise<void> {
    if (!this.SelectedSourceObjectName || !this.NewEntitySchemaName.trim() || !this.NewEntityTableName.trim()) return;
    this.IsGeneratingDDL = true;
    this.DDLPreviewContent = '';
    this.DDLPreviewError = '';
    this.cdr.detectChanges();

    try {
      const result = await this.dataService.SchemaPreview(
        this.SelectedIntegrationID,
        [{
          SourceObjectName: this.SelectedSourceObjectName,
          SchemaName: this.NewEntitySchemaName.trim(),
          TableName: this.NewEntityTableName.trim(),
          EntityName: this.NewEntityName.trim() || this.SuggestedEntityName
        }],
        'sqlserver'
      );

      if (result.Success && result.Files.length > 0) {
        this.DDLPreviewContent = result.Files.map(f => `-- ${f.Description}\n-- ${f.FilePath}\n\n${f.Content}`).join('\n\n');
      } else {
        this.DDLPreviewError = result.Message || 'No DDL generated';
      }
    } catch (e) {
      this.DDLPreviewError = `DDL generation failed: ${(e as Error).message}`;
    } finally {
      this.IsGeneratingDDL = false;
      this.cdr.detectChanges();
    }
  }

  // =====================================================================
  // Field Mapping
  // =====================================================================

  private ToEditableField(fm: FieldMapRow): EditableFieldMap {
    // Look up source metadata from IntegrationObjectField entities
    const srcMeta = this.SourceFields.find(
      sf => sf.Name.toLowerCase() === fm.SourceFieldName.toLowerCase()
    );
    return {
      ID: fm.ID,
      SourceFieldName: fm.SourceFieldName,
      SourceFieldLabel: fm.SourceFieldLabel ?? '',
      SourceFieldType: srcMeta?.Type ?? '',
      DestinationFieldName: fm.DestinationFieldName,
      DestinationFieldLabel: fm.DestinationFieldLabel ?? '',
      IsKeyField: fm.IsKeyField,
      IsRequired: fm.IsRequired,
      Direction: fm.Direction,
      Status: fm.Status as 'Active' | 'Inactive',
      IsNew: false,
      IsDirty: false,
      IsSourcePK: srcMeta?.IsPrimaryKey ?? false,
      IsSourceRequired: srcMeta?.IsRequired ?? false,
      IsSourceReadOnly: srcMeta?.IsReadOnly ?? false,
      TransformPipeline: this.ParseTransformPipeline(fm.TransformPipeline),
      ShowTransformEditor: false
    };
  }

  private ParseTransformPipeline(json: string | null): TransformStepUI[] {
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

  SerializeTransformPipeline(steps: TransformStepUI[]): string | null {
    if (steps.length === 0) return null;
    return JSON.stringify(steps.map(s => ({ Type: s.Type, Config: s.Config, OnError: s.OnError })));
  }

  private async LoadDestinationFields(entityID: string): Promise<void> {
    this.IsLoadingDestFields = true;
    this.cdr.detectChanges();
    try {
      this.DestinationFields = await this.dataService.LoadEntityFields(entityID, this.RunViewToUse);
    } finally {
      this.IsLoadingDestFields = false;
      this.cdr.detectChanges();
    }
  }

  /** Auto-generate field mappings by matching source fields to destination by name */
  async AutoGenerateFieldMappings(entityMap: EntityMapRow): Promise<void> {
    // Resolve source fields from IntegrationObject metadata
    this.IsLoadingSourceFields = true;
    this.cdr.detectChanges();
    try {
      this.SourceFields = this.resolveSourceFieldsFromMetadata(
        this.SelectedIntegrationID,
        entityMap.ExternalObjectName
      );

      if (this.SourceFields.length === 0) return;

      // Load destination fields
      await this.LoadDestinationFields(entityMap.EntityID);

      // Match fields by name (case-insensitive)
      const matchedFields = this.MatchFieldsByName(this.SourceFields, this.DestinationFields);
      this.AutoMapCount = matchedFields.length;
      this.ShowAutoMapBanner = this.AutoMapCount > 0;

      // Create field maps for matches, preserving source field order via Priority
      for (let idx = 0; idx < matchedFields.length; idx++) {
        const match = matchedFields[idx];
        const displayName = match.sourceField.DisplayName || match.sourceField.Name;
        await this.dataService.CreateFieldMap({
          EntityMapID: entityMap.ID,
          SourceFieldName: match.sourceField.Name,
          SourceFieldLabel: displayName !== match.sourceField.Name ? displayName : undefined,
          DestinationFieldName: match.destField.Name,
          IsKeyField: match.sourceField.IsPrimaryKey,
          IsRequired: match.sourceField.IsRequired,
          Direction: 'SourceToDest',
          TransformPipeline: JSON.stringify([{ Type: 'direct', Config: {}, OnError: 'Fail' }]),
          Priority: match.sourceIndex
        });
      }

      // Reload field maps
      this.FieldMaps = await this.dataService.LoadFieldMaps(entityMap.ID, this.RunViewToUse);
      this.EditableFields = this.FieldMaps.map(fm => this.ToEditableField(fm));
    } finally {
      this.IsLoadingSourceFields = false;
      this.cdr.detectChanges();
    }
  }

  private MatchFieldsByName(
    sourceFields: MJIntegrationObjectFieldEntity[],
    destFields: MJFieldOption[]
  ): Array<{ sourceField: MJIntegrationObjectFieldEntity; destField: MJFieldOption; sourceIndex: number }> {
    const matches: Array<{ sourceField: MJIntegrationObjectFieldEntity; destField: MJFieldOption; sourceIndex: number }> = [];
    const destFieldMap = new Map<string, MJFieldOption>();
    for (const df of destFields) {
      destFieldMap.set(df.Name.toLowerCase(), df);
    }

    for (let i = 0; i < sourceFields.length; i++) {
      const sf = sourceFields[i];
      const destMatch = destFieldMap.get(sf.Name.toLowerCase());
      if (destMatch) {
        matches.push({ sourceField: sf, destField: destMatch, sourceIndex: i });
      }
    }
    return matches;
  }

  /** Validation: count fields missing destination mapping */
  get UnmappedRequiredCount(): number {
    return this.EditableFields.filter(
      f => f.Status === 'Active' && f.IsRequired && !f.DestinationFieldName
    ).length;
  }

  /** Validation: check if at least one key field is configured */
  get HasKeyField(): boolean {
    return this.EditableFields.some(f => f.Status === 'Active' && f.IsKeyField);
  }

  /** Validation: overall mapping readiness */
  get MappingValidation(): { IsValid: boolean; Warnings: string[] } {
    const warnings: string[] = [];
    if (this.UnmappedRequiredCount > 0) {
      warnings.push(`${this.UnmappedRequiredCount} required field(s) missing destination mapping`);
    }
    if (!this.HasKeyField && this.ActiveEditableFields.length > 0) {
      warnings.push('No key field configured — sync may create duplicates');
    }
    return { IsValid: warnings.length === 0, Warnings: warnings };
  }

  /** Re-run auto-mapping for the currently selected entity map */
  async RerunAutoMap(): Promise<void> {
    if (!this.SelectedEntityMap) return;
    await this.AutoGenerateFieldMappings(this.SelectedEntityMap);
  }

  OnFieldChanged(field: EditableFieldMap): void {
    field.IsDirty = true;
  }

  AddFieldMapping(): void {
    this.EditableFields.push({
      ID: null,
      SourceFieldName: '',
      SourceFieldLabel: '',
      SourceFieldType: '',
      DestinationFieldName: '',
      DestinationFieldLabel: '',
      IsKeyField: false,
      IsRequired: false,
      Direction: 'SourceToDest',
      Status: 'Active',
      IsNew: true,
      IsDirty: true,
      IsSourcePK: false,
      IsSourceRequired: false,
      IsSourceReadOnly: false,
      TransformPipeline: [],
      ShowTransformEditor: false
    });
    this.cdr.detectChanges();
  }

  RemoveFieldMapping(index: number): void {
    const field = this.EditableFields[index];
    if (field.IsNew) {
      this.EditableFields.splice(index, 1);
    } else if (field.ID) {
      field.Status = 'Inactive';
      field.IsDirty = true;
    }
    this.cdr.detectChanges();
  }

  async SaveFieldMappings(): Promise<void> {
    if (!this.SelectedEntityMap) return;
    this.IsSavingFields = true;
    this.cdr.detectChanges();

    try {
      for (const field of this.EditableFields) {
        if (!field.IsDirty) continue;

        if (field.IsNew && field.SourceFieldName && field.DestinationFieldName) {
          await this.dataService.CreateFieldMap({
            EntityMapID: this.SelectedEntityMap.ID,
            SourceFieldName: field.SourceFieldName,
            SourceFieldLabel: field.SourceFieldLabel || undefined,
            DestinationFieldName: field.DestinationFieldName,
            DestinationFieldLabel: field.DestinationFieldLabel || undefined,
            IsKeyField: field.IsKeyField,
            IsRequired: field.IsRequired,
            Direction: field.Direction,
            TransformPipeline: this.SerializeTransformPipeline(field.TransformPipeline)
          });
        } else if (field.ID && field.Status === 'Inactive') {
          await this.dataService.DeleteFieldMap(field.ID);
        } else if (field.ID) {
          await this.dataService.UpdateFieldMap(field.ID, {
            SourceFieldName: field.SourceFieldName,
            DestinationFieldName: field.DestinationFieldName,
            IsKeyField: field.IsKeyField,
            IsRequired: field.IsRequired,
            Direction: field.Direction,
            Status: field.Status,
            TransformPipeline: this.SerializeTransformPipeline(field.TransformPipeline)
          });
        }
      }

      this.FieldMaps = await this.dataService.LoadFieldMaps(this.SelectedEntityMap.ID, this.RunViewToUse);
      this.EditableFields = this.FieldMaps.map(fm => this.ToEditableField(fm));
      this.ShowAutoMapBanner = false;
    } finally {
      this.IsSavingFields = false;
      this.cdr.detectChanges();
    }
  }

  DismissAutoMapBanner(): void {
    this.ShowAutoMapBanner = false;
  }

  // =====================================================================
  // Transform Pipeline
  // =====================================================================

  /** Available transform types with display metadata */
  readonly TransformTypes: Array<{ Value: TransformType; Label: string; Icon: string; Description: string }> = [
    { Value: 'direct', Label: 'Direct', Icon: 'fa-solid fa-arrow-right', Description: 'Pass through as-is (with optional default)' },
    { Value: 'regex', Label: 'Regex', Icon: 'fa-solid fa-code', Description: 'Apply regex pattern replacement' },
    { Value: 'split', Label: 'Split', Icon: 'fa-solid fa-scissors', Description: 'Split text and extract a segment' },
    { Value: 'combine', Label: 'Combine', Icon: 'fa-solid fa-object-group', Description: 'Merge multiple source fields' },
    { Value: 'lookup', Label: 'Lookup', Icon: 'fa-solid fa-book', Description: 'Map values using a lookup table' },
    { Value: 'format', Label: 'Format', Icon: 'fa-solid fa-font', Description: 'Format dates, numbers, or strings' },
    { Value: 'coerce', Label: 'Coerce', Icon: 'fa-solid fa-exchange-alt', Description: 'Convert to a different data type' },
    { Value: 'substring', Label: 'Substring', Icon: 'fa-solid fa-text-width', Description: 'Extract a portion of text' },
    { Value: 'custom', Label: 'Custom', Icon: 'fa-solid fa-wand-magic-sparkles', Description: 'Custom JavaScript expression' }
  ];

  ToggleTransformEditor(field: EditableFieldMap): void {
    // Auto-add a direct step if none exist so the editor has something to show
    if (field.TransformPipeline.length === 0) {
      field.TransformPipeline.push({ Type: 'direct', Config: {}, OnError: 'Fail' });
      field.IsDirty = true;
    }
    field.ShowTransformEditor = !field.ShowTransformEditor;
    this.cdr.detectChanges();
  }

  AddTransformStep(field: EditableFieldMap): void {
    field.TransformPipeline.push({
      Type: 'direct',
      Config: {},
      OnError: 'Fail'
    });
    field.IsDirty = true;
    field.ShowTransformEditor = true;
    this.cdr.detectChanges();
  }

  RemoveTransformStep(field: EditableFieldMap, stepIndex: number): void {
    field.TransformPipeline.splice(stepIndex, 1);
    field.IsDirty = true;
    this.cdr.detectChanges();
  }

  OnTransformTypeChange(field: EditableFieldMap, step: TransformStepUI, newType: TransformType): void {
    step.Type = newType;
    step.Config = this.GetDefaultConfigForType(newType);
    field.IsDirty = true;
    this.cdr.detectChanges();
  }

  OnTransformConfigChange(field: EditableFieldMap): void {
    field.IsDirty = true;
  }

  private GetDefaultConfigForType(type: TransformType): Record<string, unknown> {
    switch (type) {
      case 'direct': return {};
      case 'regex': return { Pattern: '', Replacement: '', Flags: 'g' };
      case 'split': return { Delimiter: ',', Index: 0 };
      case 'combine': return { SourceFields: [], Separator: ' ' };
      case 'lookup': return { Map: {}, Default: null };
      case 'format': return { FormatString: 'ISO', FormatType: 'date' };
      case 'coerce': return { TargetType: 'string' };
      case 'substring': return { Start: 0, Length: 10 };
      case 'custom': return { Expression: 'value' };
    }
  }

  GetTransformLabel(type: TransformType): string {
    return this.TransformTypes.find(t => t.Value === type)?.Label ?? type;
  }

  GetTransformIcon(type: TransformType): string {
    return this.TransformTypes.find(t => t.Value === type)?.Icon ?? 'fa-solid fa-arrow-right';
  }

  /** For combine transforms: get available source field names */
  GetAvailableSourceFields(): string[] {
    return this.SourceFields.map(sf => sf.Name);
  }

  /**
   * Resolve source fields from IntegrationObjectField metadata via IntegrationEngineBase.
   * CompanyIntegrationID → Integration → IntegrationObject → IntegrationObjectFields.
   */
  private resolveSourceFieldsFromMetadata(
    companyIntegrationID: string,
    externalObjectName: string
  ): MJIntegrationObjectFieldEntity[] {
    const engine = IntegrationEngineBase.Instance;
    const integration = engine.GetIntegrationForCompanyIntegration(companyIntegrationID);
    if (!integration) return [];

    const obj = engine.GetIntegrationObject(integration.ID, externalObjectName);
    if (!obj) return [];

    return engine.GetIntegrationObjectFields(obj.ID)
      .filter(f => f.Status === 'Active')
      .sort((a, b) => a.Sequence - b.Sequence);
  }

  /** For lookup transforms: add a new key-value pair */
  AddLookupEntry(config: Record<string, unknown>): void {
    const map = (config['Map'] as Record<string, string>) ?? {};
    map[''] = '';
    config['Map'] = map;
  }

  GetLookupEntries(config: Record<string, unknown>): Array<{ key: string; value: string }> {
    const map = (config['Map'] as Record<string, string>) ?? {};
    return Object.entries(map).map(([key, value]) => ({ key, value: String(value) }));
  }

  UpdateLookupEntry(config: Record<string, unknown>, oldKey: string, newKey: string, newValue: string): void {
    const map = (config['Map'] as Record<string, string>) ?? {};
    if (oldKey !== newKey) {
      delete map[oldKey];
    }
    map[newKey] = newValue;
    config['Map'] = { ...map };
  }

  RemoveLookupEntry(config: Record<string, unknown>, key: string): void {
    const map = (config['Map'] as Record<string, string>) ?? {};
    delete map[key];
    config['Map'] = { ...map };
  }

  /** For combine transforms: toggle a source field */
  ToggleCombineField(config: Record<string, unknown>, fieldName: string): void {
    const fields = (config['SourceFields'] as string[]) ?? [];
    const idx = fields.indexOf(fieldName);
    if (idx >= 0) {
      fields.splice(idx, 1);
    } else {
      fields.push(fieldName);
    }
    config['SourceFields'] = [...fields];
  }

  IsCombineFieldSelected(config: Record<string, unknown>, fieldName: string): boolean {
    const fields = (config['SourceFields'] as string[]) ?? [];
    return fields.includes(fieldName);
  }

  // =====================================================================
  // Data Preview
  // =====================================================================

  async LoadSourcePreview(): Promise<void> {
    if (!this.SelectedEntityMap) return;
    this.IsLoadingSourcePreview = true;
    this.ShowSourcePreview = true;
    this.SourcePreviewData = [];
    this.cdr.detectChanges();

    try {
      const result = await this.dataService.PreviewSourceData(
        this.SelectedIntegrationID,
        this.SelectedEntityMap.ExternalObjectName,
        5
      );
      this.SourcePreviewData = result;
    } catch (e) {
      console.error('[MappingWorkspace] Source preview failed:', (e as Error).message);
    } finally {
      this.IsLoadingSourcePreview = false;
      this.cdr.detectChanges();
    }
  }

  async LoadDestPreview(): Promise<void> {
    if (!this.SelectedEntityMap) return;
    this.IsLoadingDestPreview = true;
    this.ShowDestPreview = true;
    this.DestPreviewData = [];
    this.cdr.detectChanges();

    try {
      const result = await this.dataService.PreviewDestinationData(
        this.SelectedEntityMap.EntityID,
        5,
        this.RunViewToUse
      );
      this.DestPreviewData = result;
    } catch (e) {
      console.error('[MappingWorkspace] Dest preview failed:', (e as Error).message);
    } finally {
      this.IsLoadingDestPreview = false;
      this.cdr.detectChanges();
    }
  }

  CloseSourcePreview(): void {
    this.ShowSourcePreview = false;
    this.SourcePreviewData = [];
  }

  CloseDestPreview(): void {
    this.ShowDestPreview = false;
    this.DestPreviewData = [];
  }

  private CloseAllPreviews(): void {
    this.CloseSourcePreview();
    this.CloseDestPreview();
    this.ShowAutoMapBanner = false;
  }

  GetPreviewColumns(data: PreviewRecord[]): string[] {
    if (data.length === 0) return [];
    return Object.keys(data[0]).slice(0, 8); // Limit to 8 columns for readability
  }

  FormatPreviewValue(value: string | number | boolean | null): string {
    if (value == null) return '--';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    const str = String(value);
    return str.length > 50 ? str.substring(0, 47) + '...' : str;
  }

  // =====================================================================
  // Pending Map Actions
  // =====================================================================

  CopyDDLToClipboard(ddl: string): void {
    navigator.clipboard.writeText(ddl).catch(() => {
      console.error('[MappingWorkspace] Failed to copy DDL to clipboard');
    });
  }

  GetPendingStepStatus(pendingMap: PendingMapEntry, step: number): 'current' | 'done' | 'future' {
    // Step 1: Map Created — always done for pending maps
    // Step 2: DDL Generated — done if DDL content exists
    // Step 3: Deploy & CodeGen — always future (manual step)
    // Step 4: Ready to Sync — always future
    if (step === 1) return 'done';
    if (step === 2) return pendingMap.DDLContent ? 'done' : 'current';
    return 'future';
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  get RunStatusColor(): string {
    if (!this.LatestRun) return 'gray';
    if (this.LatestRun.Status === 'Success') return 'green';
    if (this.LatestRun.Status === 'Failed') return 'red';
    return 'amber';
  }

  FormatDate(dateStr: string | null): string {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Mapping Workspace';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-diagram-project';
  }
}

export function LoadMappingWorkspace(): void {
  // Tree-shaking prevention
}
