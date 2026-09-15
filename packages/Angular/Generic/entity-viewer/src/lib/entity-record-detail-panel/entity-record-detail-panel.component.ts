import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, NgZone } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { EntityInfo, EntityRelationshipInfo, EntityOrganicKeyInfo, EntityOrganicKeyRelatedEntityInfo, RunView, Metadata, RunViewParams, EntityFieldValueListType, EntityFieldInfo, CompositeKey } from '@memberjunction/core';
import { BuildCompositeKey, BuildPkString } from '../utils/record.util';

interface RelatedEntityData {
  relationship: EntityRelationshipInfo;
  relatedEntityName: string;
  count: number;
  isExpanded: boolean;
  records: Record<string, unknown>[];
  isLoadingRecords: boolean;
}

interface OrganicKeyMatchData {
  organicKey: EntityOrganicKeyInfo;
  relatedEntity: EntityOrganicKeyRelatedEntityInfo;
  relatedEntityName: string;
  count: number;
  isExpanded: boolean;
  records: Record<string, unknown>[];
  isLoadingRecords: boolean;
}

/**
 * Field display types for categorizing how to render each field
 */
type FieldDisplayType = 'primary-key' | 'foreign-key' | 'enum' | 'regular';

/**
 * Enhanced field display info with type categorization
 */
interface FieldDisplay {
  type: FieldDisplayType;
  name: string;
  label: string;
  value: string;
  // For FK fields - the display name from the virtual/mapped field
  displayValue?: string;
  // For FK fields - related entity info for navigation
  relatedEntityName?: string;
  relatedRecordId?: string;
}

/**
 * Event emitted when navigating to a related entity
 */
export interface NavigateToRelatedEvent {
  entityName: string;
  filter: string;
}

/**
 * Event emitted when opening a related record
 */
export interface OpenRelatedRecordEvent {
  entityName: string;
  record: Record<string, unknown>;
}

/**
 * Event emitted when opening a foreign key record
 */
export interface OpenForeignKeyRecordEvent {
  entityName: string;
  recordId: string;
}

/**
 * EntityRecordDetailPanelComponent - A reusable panel for displaying entity record details
 *
 * This component provides a detail panel view for entity records with:
 * - Primary key display with copy functionality
 * - Foreign key fields showing friendly names with navigation
 * - Enum fields displayed as pills
 * - Related entities with expandable record lists
 * - Configurable sections for details and relationships
 *
 * @example
 * ```html
 * <mj-entity-record-detail-panel
 *   [entity]="selectedEntity"
 *   [record]="selectedRecord"
 *   (close)="onClosePanel()"
 *   (openRecord)="onOpenRecord($event)"
 *   (navigateToRelated)="onNavigateToRelated($event)">
 * </mj-entity-record-detail-panel>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-entity-record-detail-panel',
  templateUrl: './entity-record-detail-panel.component.html',
  styleUrls: ['./entity-record-detail-panel.component.css']
})
export class EntityRecordDetailPanelComponent extends BaseAngularComponent implements OnChanges  {
  @Input() entity: EntityInfo | null = null;
  @Input() record: Record<string, unknown> | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() OpenRecord = new EventEmitter<Record<string, unknown>>();

  /**
   * @deprecated Use {@link OpenRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openRecord) keeps working. Must stay AFTER OpenRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openRecord = this.OpenRecord;
  @Output() NavigateToRelated = new EventEmitter<NavigateToRelatedEvent>();

  /**
   * @deprecated Use {@link NavigateToRelated}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (navigateToRelated) keeps working. Must stay AFTER NavigateToRelated: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() navigateToRelated = this.NavigateToRelated;
  @Output() OpenRelatedRecord = new EventEmitter<OpenRelatedRecordEvent>();

  /**
   * @deprecated Use {@link OpenRelatedRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openRelatedRecord) keeps working. Must stay AFTER OpenRelatedRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openRelatedRecord = this.OpenRelatedRecord;
  @Output() OpenForeignKeyRecord = new EventEmitter<OpenForeignKeyRecordEvent>();

  /**
   * @deprecated Use {@link OpenForeignKeyRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openForeignKeyRecord) keeps working. Must stay AFTER OpenForeignKeyRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openForeignKeyRecord = this.OpenForeignKeyRecord;

  // Related entity counts
  public RelatedEntities: RelatedEntityData[] = [];

  /** @deprecated Use {@link RelatedEntities}. */
  public get relatedEntities(): RelatedEntityData[] {
    return this.RelatedEntities;
  }
  /** @deprecated Use {@link RelatedEntities}. */
  public set relatedEntities(value: RelatedEntityData[]) {
    this.RelatedEntities = value;
  }
  public IsLoadingRelationships = false;

  /** @deprecated Use {@link IsLoadingRelationships}. */
  public get isLoadingRelationships() {
    return this.IsLoadingRelationships;
  }
  /** @deprecated Use {@link IsLoadingRelationships}. */
  public set isLoadingRelationships(value) {
    this.IsLoadingRelationships = value;
  }

  // Organic key match counts
  public OrganicKeyMatches: OrganicKeyMatchData[] = [];

  /** @deprecated Use {@link OrganicKeyMatches}. */
  public get organicKeyMatches(): OrganicKeyMatchData[] {
    return this.OrganicKeyMatches;
  }
  /** @deprecated Use {@link OrganicKeyMatches}. */
  public set organicKeyMatches(value: OrganicKeyMatchData[]) {
    this.OrganicKeyMatches = value;
  }
  public IsLoadingOrganicKeys = false;

  /** @deprecated Use {@link IsLoadingOrganicKeys}. */
  public get isLoadingOrganicKeys() {
    return this.IsLoadingOrganicKeys;
  }
  /** @deprecated Use {@link IsLoadingOrganicKeys}. */
  public set isLoadingOrganicKeys(value) {
    this.IsLoadingOrganicKeys = value;
  }

  private metadata = this.ProviderToUse;

  // Sections expanded state
  public DetailsSectionExpanded = true;

  /** @deprecated Use {@link DetailsSectionExpanded}. */
  public get detailsSectionExpanded() {
    return this.DetailsSectionExpanded;
  }
  /** @deprecated Use {@link DetailsSectionExpanded}. */
  public set detailsSectionExpanded(value) {
    this.DetailsSectionExpanded = value;
  }
  public RelationshipsSectionExpanded = true;

  /** @deprecated Use {@link RelationshipsSectionExpanded}. */
  public get relationshipsSectionExpanded() {
    return this.RelationshipsSectionExpanded;
  }
  /** @deprecated Use {@link RelationshipsSectionExpanded}. */
  public set relationshipsSectionExpanded(value) {
    this.RelationshipsSectionExpanded = value;
  }
  public OrganicKeysSectionExpanded = true;

  /** @deprecated Use {@link OrganicKeysSectionExpanded}. */
  public get organicKeysSectionExpanded() {
    return this.OrganicKeysSectionExpanded;
  }
  /** @deprecated Use {@link OrganicKeysSectionExpanded}. */
  public set organicKeysSectionExpanded(value) {
    this.OrganicKeysSectionExpanded = value;
  }

  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {
  super();}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['record'] && this.record && this.entity) {
      this.loadRelationshipCounts();
      this.loadOrganicKeyCounts();
    }
  }

  /**
   * Load counts for related entities using batch RunViews call
   */
  private async loadRelationshipCounts(): Promise<void> {
    if (!this.entity || !this.record) return;

    this.IsLoadingRelationships = true;
    this.RelatedEntities = [];

    // Get relationships where this entity is the related entity (foreign keys pointing TO this record)
    const relationships = this.entity.RelatedEntities;

    if (relationships.length === 0) {
      this.IsLoadingRelationships = false;
      return;
    }

    // Build a CompositeKey for the current record
    const compositeKey = BuildCompositeKey(this.record, this.entity);

    // Get the first PK value for the join field filter
    const pkValue = compositeKey.KeyValuePairs[0]?.Value;
    if (!pkValue) {
      this.IsLoadingRelationships = false;
      return;
    }

    // Build batch query params for all relationships
    const viewParams: RunViewParams[] = relationships.map(rel => ({
      EntityName: rel.RelatedEntity,
      ExtraFilter: `${rel.RelatedEntityJoinField}='${pkValue}'`,
      ResultType: 'count_only'
    }));

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const results = await rv.RunViews(viewParams);

      // Map results back to relationship data
      this.RelatedEntities = relationships.map((rel, index) => {
        const result = results[index];
        return {
          relationship: rel,
          relatedEntityName: rel.RelatedEntity,
          count: result.Success ? result.TotalRowCount : 0,
          isExpanded: false,
          records: [],
          isLoadingRecords: false
        };
      });
    } catch (error) {
      console.warn('Failed to load relationship counts:', error);
      // Initialize with zero counts on error
      this.RelatedEntities = relationships.map(rel => ({
        relationship: rel,
        relatedEntityName: rel.RelatedEntity,
        count: 0,
        isExpanded: false,
        records: [],
        isLoadingRecords: false
      }));
    } finally {
      this.ngZone.run(() => {
        this.IsLoadingRelationships = false;
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Load counts for organic key matches using batch RunViews call.
   * Builds query filters using EntityInfo.BuildOrganicKeyViewParams for each related entity.
   */
  private async loadOrganicKeyCounts(): Promise<void> {
    if (!this.entity || !this.record) return;

    const organicKeys = this.entity.OrganicKeys;
    if (!organicKeys || organicKeys.length === 0) {
      this.OrganicKeyMatches = [];
      return;
    }

    // Flatten all organic key related entities
    const allPairs: { organicKey: EntityOrganicKeyInfo; relatedEntity: EntityOrganicKeyRelatedEntityInfo }[] = [];
    for (const ok of organicKeys) {
      for (const re of ok.RelatedEntities) {
        allPairs.push({ organicKey: ok, relatedEntity: re });
      }
    }

    if (allPairs.length === 0) {
      this.OrganicKeyMatches = [];
      return;
    }

    this.IsLoadingOrganicKeys = true;
    this.OrganicKeyMatches = [];

    // Build a mock BaseEntity-like object for BuildOrganicKeyViewParams
    // The static method only calls record.Get(fieldName), so we can duck-type it
    const mockRecord = {
      Get: (fieldName: string) => this.record ? this.record[fieldName] ?? null : null,
      EntityInfo: this.entity,
    };

    // Build batch query params
    const viewParams: RunViewParams[] = allPairs.map(pair =>  {
      const params = EntityInfo.BuildOrganicKeyViewParams(
        mockRecord as never,
        pair.relatedEntity,
        pair.organicKey,
      );
      params.ResultType = 'count_only';
      return params;
    });

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const results = await rv.RunViews(viewParams);

      this.OrganicKeyMatches = allPairs.map((pair, index) => {
        const result = results[index];
        return {
          organicKey: pair.organicKey,
          relatedEntity: pair.relatedEntity,
          relatedEntityName: pair.relatedEntity.DisplayName || pair.relatedEntity.RelatedEntity,
          count: result.Success ? result.TotalRowCount : 0,
          isExpanded: false,
          records: [],
          isLoadingRecords: false,
        };
      });
    } catch (error) {
      console.warn('Failed to load organic key counts:', error);
      this.OrganicKeyMatches = allPairs.map(pair => ({
        organicKey: pair.organicKey,
        relatedEntity: pair.relatedEntity,
        relatedEntityName: pair.relatedEntity.DisplayName || pair.relatedEntity.RelatedEntity,
        count: 0,
        isExpanded: false,
        records: [],
        isLoadingRecords: false,
      }));
    } finally {
      this.ngZone.run(() => {
        this.IsLoadingOrganicKeys = false;
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Get only organic key matches that have records (count > 0)
   */
  get OrganicKeyMatchesWithRecords(): OrganicKeyMatchData[] {
    return this.OrganicKeyMatches.filter(m => m.count > 0);
  }

  /** @deprecated Use {@link OrganicKeyMatchesWithRecords}. */
  get organicKeyMatchesWithRecords(): OrganicKeyMatchData[] {
    return this.OrganicKeyMatchesWithRecords;
  }

  /**
   * Toggle expansion of an organic key match section and load records if needed
   */
  async ToggleOrganicKeyExpansion(match: OrganicKeyMatchData, event: Event): Promise<void> {
    event.stopPropagation();
    if (match.count === 0) return;

    match.isExpanded = !match.isExpanded;

    if (match.isExpanded && match.records.length === 0 && !match.isLoadingRecords) {
      await this.loadOrganicKeyRecords(match);
    }
  }

  /** @deprecated Use {@link ToggleOrganicKeyExpansion}. */
  async toggleOrganicKeyExpansion(match: OrganicKeyMatchData, event: Event): Promise<void> {
    return this.ToggleOrganicKeyExpansion(match, event);
  }

  /**
   * Load actual records for an organic key match
   */
  private async loadOrganicKeyRecords(match: OrganicKeyMatchData): Promise<void> {
    if (!this.record || !this.entity) return;

    match.isLoadingRecords = true;
    this.cdr.detectChanges();

    const mockRecord = {
      Get: (fieldName: string) => this.record ? this.record[fieldName] ?? null : null,
      EntityInfo: this.entity,
    };

    try {
      const params = EntityInfo.BuildOrganicKeyViewParams(
        mockRecord as never,
        match.relatedEntity,
        match.organicKey,
      );

      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const relatedEntityInfo = this.metadata.Entities.find(e => e.Name === match.relatedEntity.RelatedEntity);
      const fields = relatedEntityInfo
        ? [...relatedEntityInfo.PrimaryKeys.map(pk => pk.Name),
           ...(relatedEntityInfo.NameField ? [relatedEntityInfo.NameField.Name] : []),
           ...relatedEntityInfo.Fields.filter(f => f.DefaultInView).map(f => f.Name)]
        : undefined;

      const result = await rv.RunView<Record<string, unknown>>({
        ...params,
        ResultType: 'simple',
        ...(fields ? { Fields: fields } : {}),
        MaxRows: 10,
      });

      if (result.Success) {
        match.records = result.Results;
      }
    } catch (error) {
      console.warn(`Failed to load organic key records for ${match.relatedEntityName}:`, error);
    } finally {
      this.ngZone.run(() => {
        match.isLoadingRecords = false;
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Handle click on an organic key record
   */
  OnOrganicKeyRecordClick(match: OrganicKeyMatchData, record: Record<string, unknown>, event: Event): void {
    event.stopPropagation();
    this.OpenRelatedRecord.emit({
      entityName: match.relatedEntity.RelatedEntity,
      record,
    });
  }

  /** @deprecated Use {@link OnOrganicKeyRecordClick}. */
  onOrganicKeyRecordClick(match: OrganicKeyMatchData, record: Record<string, unknown>, event: Event): void {
    return this.OnOrganicKeyRecordClick(match, record, event);
  }

  /**
   * Navigate to view all organic key matched records
   */
  OnViewAllOrganicKey(match: OrganicKeyMatchData, event: Event): void {
    event.stopPropagation();
    if (!this.record || !this.entity) return;

    const mockRecord = {
      Get: (fieldName: string) => this.record ? this.record[fieldName] ?? null : null,
      EntityInfo: this.entity,
    };
    const params = EntityInfo.BuildOrganicKeyViewParams(
      mockRecord as never,
      match.relatedEntity,
      match.organicKey,
    );

    this.NavigateToRelated.emit({
      entityName: match.relatedEntity.RelatedEntity,
      filter: String(params.ExtraFilter || ''),
    });
  }

  /** @deprecated Use {@link OnViewAllOrganicKey}. */
  onViewAllOrganicKey(match: OrganicKeyMatchData, event: Event): void {
    return this.OnViewAllOrganicKey(match, event);
  }

  /**
   * Get display name for an organic key record
   */
  GetOrganicKeyRecordDisplayName(match: OrganicKeyMatchData, record: Record<string, unknown>): string {
    const entityInfo = this.metadata.Entities.find(e => e.Name === match.relatedEntity.RelatedEntity);
    if (entityInfo?.NameField) {
      const name = record[entityInfo.NameField.Name];
      if (name) return String(name);
    }
    if (entityInfo) {
      return BuildPkString(record, entityInfo);
    }
    return 'Record';
  }

  /** @deprecated Use {@link GetOrganicKeyRecordDisplayName}. */
  getOrganicKeyRecordDisplayName(match: OrganicKeyMatchData, record: Record<string, unknown>): string {
    return this.GetOrganicKeyRecordDisplayName(match, record);
  }

  /**
   * Get subtitle for an organic key record
   */
  GetOrganicKeyRecordSubtitle(match: OrganicKeyMatchData, record: Record<string, unknown>): string {
    const entityInfo = this.metadata.Entities.find(e => e.Name === match.relatedEntity.RelatedEntity);
    if (!entityInfo) return '';

    const subtitleFieldNames = ['Description', 'Status', 'Type', 'Email', 'Date', 'Amount', 'Total'];
    for (const fieldName of subtitleFieldNames) {
      const field = entityInfo.Fields.find(f =>
        f.Name.includes(fieldName) && f.Name !== entityInfo.NameField?.Name
      );
      if (field) {
        const value = record[field.Name];
        if (value !== null && value !== undefined) {
          return this.formatFieldValue(value, field.Name);
        }
      }
    }
    return '';
  }

  /** @deprecated Use {@link GetOrganicKeyRecordSubtitle}. */
  getOrganicKeyRecordSubtitle(match: OrganicKeyMatchData, record: Record<string, unknown>): string {
    return this.GetOrganicKeyRecordSubtitle(match, record);
  }

  /**
   * Get icon for an organic key matched entity
   */
  GetOrganicKeyEntityIcon(match: OrganicKeyMatchData): string {
    const entityInfo = this.metadata.Entities.find(e => e.Name === match.relatedEntity.RelatedEntity);
    if (entityInfo?.Icon) {
      return this.formatEntityIcon(entityInfo.Icon);
    }
    return 'fa-solid fa-link';
  }

  /** @deprecated Use {@link GetOrganicKeyEntityIcon}. */
  getOrganicKeyEntityIcon(match: OrganicKeyMatchData): string {
    return this.GetOrganicKeyEntityIcon(match);
  }

  /**
   * Get key fields to display in details section, categorized by type
   */
  get DisplayFields(): FieldDisplay[] {
    if (!this.entity || !this.record) return [];

    const fields: FieldDisplay[] = [];
    const excludePatterns = ['__mj_', 'password', 'secret', 'token'];

    for (const field of this.entity.Fields) {
      // Skip system fields and sensitive fields
      if (excludePatterns.some(p => field.Name.toLowerCase().includes(p))) continue;
      // Skip very long text fields (but not FK fields which are usually GUIDs)
      if (field.Length && field.Length > 500 && !field.RelatedEntityID) continue;

      const value = this.record[field.Name];

      // Handle Primary Key fields specially
      if (field.IsPrimaryKey) {
        fields.push({
          type: 'primary-key',
          name: field.Name,
          label: this.formatFieldLabel(field),
          value: value !== null && value !== undefined ? String(value) : ''
        });
        continue;
      }

      // Handle Foreign Key fields - show the related record name instead of ID
      if (field.RelatedEntityID && field.RelatedEntityID.length > 0) {
        const fkDisplay = this.buildForeignKeyDisplay(field, value);
        if (fkDisplay) {
          fields.push(fkDisplay);
        }
        continue;
      }

      // Skip empty values for regular fields
      if (value === null || value === undefined || String(value).trim() === '') continue;

      // Limit regular fields to reasonable number
      if (fields.filter(f => f.type === 'regular' || f.type === 'enum').length >= 10) continue;

      // Check if this field has enumerated values
      const isEnum = field.ValueListTypeEnum !== EntityFieldValueListType.None &&
                     field.EntityFieldValues.length > 0;

      fields.push({
        type: isEnum ? 'enum' : 'regular',
        name: field.Name,
        label: this.formatFieldLabel(field),
        value: this.formatFieldValue(value, field.Name)
      });
    }

    return fields;
  }

  /** @deprecated Use {@link DisplayFields}. */
  get displayFields(): FieldDisplay[] {
    return this.DisplayFields;
  }

  /**
   * Build display info for a foreign key field
   * Uses RelatedEntityNameFieldMap to get the human-readable name
   * Label comes from the virtual field's DisplayNameOrName (e.g., "Template" not "Template ID")
   */
  private buildForeignKeyDisplay(field: EntityFieldInfo, value: unknown): FieldDisplay | null {
    if (value === null || value === undefined || String(value).trim() === '') {
      return null;
    }

    const fkValue = String(value);
    let displayValue = fkValue;
    let label = field.DisplayNameOrName; // Fallback to FK field's label

    // Try to get the display name from the mapped field
    // RelatedEntityNameFieldMap tells us which field contains the name of the related record
    if (field.RelatedEntityNameFieldMap && field.RelatedEntityNameFieldMap.trim().length > 0) {
      const mappedValue = this.record![field.RelatedEntityNameFieldMap];
      if (mappedValue !== null && mappedValue !== undefined && String(mappedValue).trim() !== '') {
        displayValue = String(mappedValue);
      }
      // Use the mapped field's DisplayNameOrName for the label
      const mappedField = this.entity!.Fields.find(f => f.Name === field.RelatedEntityNameFieldMap);
      if (mappedField) {
        label = mappedField.DisplayNameOrName;
      }
    } else {
      // Fallback: try to find a virtual field with the same name minus "ID" suffix
      // e.g., for "TemplateID", look for "Template" field
      const baseName = field.Name.replace(/ID$/i, '');
      if (baseName !== field.Name) {
        const virtualField = this.entity!.Fields.find(f =>
          f.Name.toLowerCase() === baseName.toLowerCase() && f.IsVirtual
        );
        if (virtualField) {
          const virtualValue = this.record![virtualField.Name];
          if (virtualValue !== null && virtualValue !== undefined && String(virtualValue).trim() !== '') {
            displayValue = String(virtualValue);
          }
          // Use the virtual field's DisplayNameOrName for the label
          label = virtualField.DisplayNameOrName;
        }
      }
    }

    return {
      type: 'foreign-key',
      name: field.Name,
      label: label,
      value: fkValue,
      displayValue: displayValue,
      relatedEntityName: field.RelatedEntity || undefined,
      relatedRecordId: fkValue
    };
  }

  /**
   * Format field name to display label using EntityFieldInfo's built-in property
   */
  private formatFieldLabel(field: EntityFieldInfo): string {
    return field.DisplayNameOrName;
  }

  /**
   * Format field value for display
   */
  private formatFieldValue(value: unknown, fieldName: string): string {
    if (value === null || value === undefined) return '-';

    // Handle dates
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }

    // Handle booleans
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    // Handle numbers that look like currency
    if (typeof value === 'number') {
      const nameLower = fieldName.toLowerCase();
      if (nameLower.includes('amount') ||
          nameLower.includes('price') ||
          nameLower.includes('cost') ||
          nameLower.includes('total') ||
          nameLower.includes('value')) {
        return `$${value.toLocaleString()}`;
      }
      return value.toLocaleString();
    }

    const strValue = String(value);

    // Truncate long strings
    if (strValue.length > 100) {
      return strValue.substring(0, 100) + '...';
    }

    return strValue;
  }

  /**
   * Get record title
   */
  get RecordTitle(): string {
    if (!this.entity || !this.record) return 'Record';

    if (this.entity.NameField) {
      const name = this.record[this.entity.NameField.Name];
      if (name) return String(name);
    }

    return BuildPkString(this.record, this.entity);
  }

  /** @deprecated Use {@link RecordTitle}. */
  get recordTitle(): string {
    return this.RecordTitle;
  }

  /**
   * Handle close button click
   */
  OnClose(): void {
    this.close.emit();
  }

  /** @deprecated Use {@link OnClose}. */
  onClose(): void {
    return this.OnClose();
  }

  /**
   * Handle open record button click
   */
  OnOpenRecord(): void {
    if (this.record) {
      this.OpenRecord.emit(this.record);
    }
  }

  /** @deprecated Use {@link OnOpenRecord}. */
  onOpenRecord(): void {
    return this.OnOpenRecord();
  }

  /**
   * Copy primary key value to clipboard
   */
  CopyToClipboard(value: string, event: Event): void {
    event.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      // Could add a toast notification here
      console.log('Copied to clipboard:', value);
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  /** @deprecated Use {@link CopyToClipboard}. */
  copyToClipboard(value: string, event: Event): void {
    return this.CopyToClipboard(value, event);
  }

  /**
   * Open a foreign key record (FK link click)
   * Emits openForeignKeyRecord event for parent to handle opening the record
   */
  OnForeignKeyClick(field: FieldDisplay, event: Event): void {
    event.stopPropagation();
    if (field.relatedEntityName && field.relatedRecordId) {
      this.OpenForeignKeyRecord.emit({
        entityName: field.relatedEntityName,
        recordId: field.relatedRecordId
      });
    }
  }

  /** @deprecated Use {@link OnForeignKeyClick}. */
  onForeignKeyClick(field: FieldDisplay, event: Event): void {
    return this.OnForeignKeyClick(field, event);
  }

  /**
   * Check if a FK display value is different from the raw ID (i.e., we have a name to show)
   */
  HasFriendlyName(field: FieldDisplay): boolean {
    return field.type === 'foreign-key' &&
           field.displayValue !== undefined &&
           field.displayValue !== field.value;
  }

  /** @deprecated Use {@link HasFriendlyName}. */
  hasFriendlyName(field: FieldDisplay): boolean {
    return this.HasFriendlyName(field);
  }

  /**
   * Toggle expansion of related entity section and load records if needed
   */
  async ToggleRelatedEntityExpansion(relEntity: RelatedEntityData, event: Event): Promise<void> {
    event.stopPropagation();

    if (relEntity.count === 0) return;

    relEntity.isExpanded = !relEntity.isExpanded;

    // Load records on first expansion
    if (relEntity.isExpanded && relEntity.records.length === 0 && !relEntity.isLoadingRecords) {
      await this.loadRelatedRecords(relEntity);
    }
  }

  /** @deprecated Use {@link ToggleRelatedEntityExpansion}. */
  async toggleRelatedEntityExpansion(relEntity: RelatedEntityData, event: Event): Promise<void> {
    return this.ToggleRelatedEntityExpansion(relEntity, event);
  }

  /**
   * Load actual records for a related entity
   */
  private async loadRelatedRecords(relEntity: RelatedEntityData): Promise<void> {
    if (!this.record || !this.entity) return;

    const compositeKey = BuildCompositeKey(this.record, this.entity);
    const pkValue = compositeKey.KeyValuePairs[0]?.Value;
    if (!pkValue) return;

    relEntity.isLoadingRecords = true;
    this.cdr.detectChanges();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      // Look up related entity info to compute fields
      const relatedEntityInfo = this.metadata.Entities.find(e => e.Name === relEntity.relationship.RelatedEntity);
      const fields = relatedEntityInfo
        ? [...relatedEntityInfo.PrimaryKeys.map(pk => pk.Name),
           ...(relatedEntityInfo.NameField ? [relatedEntityInfo.NameField.Name] : []),
           ...relatedEntityInfo.Fields.filter(f => f.DefaultInView).map(f => f.Name)]
        : undefined;
      const result = await rv.RunView<Record<string, unknown>>({
        EntityName: relEntity.relationship.RelatedEntity,
        ExtraFilter: `${relEntity.relationship.RelatedEntityJoinField}='${pkValue}'`,
        ResultType: 'simple',
        ...(fields ? { Fields: fields } : {}),
        MaxRows: 10 // Limit inline display to 10 records
      });

      if (result.Success) {
        relEntity.records = result.Results;
      }
    } catch (error) {
      console.warn(`Failed to load records for ${relEntity.relatedEntityName}:`, error);
    } finally {
      this.ngZone.run(() => {
        relEntity.isLoadingRecords = false;
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Handle click on individual related record - opens in new tab
   */
  OnRelatedRecordClick(relEntity: RelatedEntityData, record: Record<string, unknown>, event: Event): void {
    event.stopPropagation();
    this.OpenRelatedRecord.emit({
      entityName: relEntity.relatedEntityName,
      record
    });
  }

  /** @deprecated Use {@link OnRelatedRecordClick}. */
  onRelatedRecordClick(relEntity: RelatedEntityData, record: Record<string, unknown>, event: Event): void {
    return this.OnRelatedRecordClick(relEntity, record, event);
  }

  /**
   * Navigate to view all related records (when count > 10)
   */
  OnViewAllRelated(relEntity: RelatedEntityData, event: Event): void {
    event.stopPropagation();

    if (!this.record || !this.entity) return;

    const compositeKey = BuildCompositeKey(this.record, this.entity);
    const pkValue = compositeKey.KeyValuePairs[0]?.Value;
    if (!pkValue) return;

    this.NavigateToRelated.emit({
      entityName: relEntity.relatedEntityName,
      filter: `${relEntity.relationship.RelatedEntityJoinField}='${pkValue}'`
    });
  }

  /** @deprecated Use {@link OnViewAllRelated}. */
  onViewAllRelated(relEntity: RelatedEntityData, event: Event): void {
    return this.OnViewAllRelated(relEntity, event);
  }

  /**
   * Get display name for a related record
   */
  GetRelatedRecordDisplayName(relEntity: RelatedEntityData, record: Record<string, unknown>): string {
    const entityInfo = this.metadata.Entities.find(e => e.Name === relEntity.relatedEntityName);
    if (entityInfo?.NameField) {
      const name = record[entityInfo.NameField.Name];
      if (name) return String(name);
    }
    if (entityInfo) {
      return BuildPkString(record, entityInfo);
    }
    return 'Record';
  }

  /** @deprecated Use {@link GetRelatedRecordDisplayName}. */
  getRelatedRecordDisplayName(relEntity: RelatedEntityData, record: Record<string, unknown>): string {
    return this.GetRelatedRecordDisplayName(relEntity, record);
  }

  /**
   * Get subtitle/secondary info for a related record
   */
  GetRelatedRecordSubtitle(relEntity: RelatedEntityData, record: Record<string, unknown>): string {
    const entityInfo = this.metadata.Entities.find(e => e.Name === relEntity.relatedEntityName);
    if (!entityInfo) return '';

    // Look for common subtitle fields
    const subtitleFieldNames = ['Description', 'Status', 'Type', 'Email', 'Date', 'Amount', 'Total'];
    for (const fieldName of subtitleFieldNames) {
      const field = entityInfo.Fields.find(f =>
        f.Name.includes(fieldName) && f.Name !== entityInfo.NameField?.Name
      );
      if (field) {
        const value = record[field.Name];
        if (value !== null && value !== undefined) {
          return this.formatFieldValue(value, field.Name);
        }
      }
    }
    return '';
  }

  /** @deprecated Use {@link GetRelatedRecordSubtitle}. */
  getRelatedRecordSubtitle(relEntity: RelatedEntityData, record: Record<string, unknown>): string {
    return this.GetRelatedRecordSubtitle(relEntity, record);
  }

  /**
   * Get only related entities that have records (count > 0)
   */
  get RelatedEntitiesWithRecords(): RelatedEntityData[] {
    return this.RelatedEntities.filter(r => r.count > 0);
  }

  /** @deprecated Use {@link RelatedEntitiesWithRecords}. */
  get relatedEntitiesWithRecords(): RelatedEntityData[] {
    return this.RelatedEntitiesWithRecords;
  }

  /**
   * Get icon for related entity by looking up EntityInfo from Metadata
   */
  GetRelatedEntityIcon(relEntity: RelatedEntityData): string {
    const entityInfo = this.metadata.Entities.find(e => e.Name === relEntity.relatedEntityName);
    if (entityInfo?.Icon) {
      return this.formatEntityIcon(entityInfo.Icon);
    }
    return 'fa-solid fa-table';
  }

  /** @deprecated Use {@link GetRelatedEntityIcon}. */
  getRelatedEntityIcon(relEntity: RelatedEntityData): string {
    return this.GetRelatedEntityIcon(relEntity);
  }

  /**
   * Get the icon class for the current entity
   */
  GetEntityIconClass(): string {
    if (!this.entity?.Icon) {
      return 'fa-solid fa-table';
    }
    return this.formatEntityIcon(this.entity.Icon);
  }

  /** @deprecated Use {@link GetEntityIconClass}. */
  getEntityIconClass(): string {
    return this.GetEntityIconClass();
  }

  /**
   * Format entity icon to ensure proper Font Awesome class format
   */
  private formatEntityIcon(icon: string): string {
    if (!icon) {
      return 'fa-solid fa-table';
    }
    // If icon already has fa- prefix, use it as-is
    if (icon.startsWith('fa-') || icon.startsWith('fa ')) {
      // Ensure it has a style prefix (fa-solid, fa-regular, etc.)
      if (icon.startsWith('fa-solid') || icon.startsWith('fa-regular') ||
          icon.startsWith('fa-light') || icon.startsWith('fa-brands') ||
          icon.startsWith('fa ')) {
        return icon;
      }
      // It's just "fa-something", add fa-solid prefix
      return `fa-solid ${icon}`;
    }
    // Check if it's just an icon name like "table" or "users"
    return `fa-solid fa-${icon}`;
  }
}
