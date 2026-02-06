import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { EntityInfo, EntityRelationshipInfo, RunView, Metadata, RunViewParams, EntityFieldValueListType, EntityFieldInfo } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';

interface RelatedEntityData {
  relationship: EntityRelationshipInfo;
  relatedEntityName: string;
  count: number;
  isExpanded: boolean;
  records: BaseEntity[];
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
  record: BaseEntity;
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
export class EntityRecordDetailPanelComponent implements OnChanges {
  @Input() entity: EntityInfo | null = null;
  @Input() record: BaseEntity | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() openRecord = new EventEmitter<BaseEntity>();
  @Output() navigateToRelated = new EventEmitter<NavigateToRelatedEvent>();
  @Output() openRelatedRecord = new EventEmitter<OpenRelatedRecordEvent>();
  @Output() openForeignKeyRecord = new EventEmitter<OpenForeignKeyRecordEvent>();

  // Related entity counts
  public relatedEntities: RelatedEntityData[] = [];
  public isLoadingRelationships = false;

  private metadata = new Metadata();

  // Sections expanded state
  public detailsSectionExpanded = true;
  public relationshipsSectionExpanded = true;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['record'] && this.record && this.entity) {
      this.loadRelationshipCounts();
    }
  }

  /**
   * Load counts for related entities using batch RunViews call
   */
  private async loadRelationshipCounts(): Promise<void> {
    if (!this.entity || !this.record) return;

    this.isLoadingRelationships = true;
    this.relatedEntities = [];

    // Get relationships where this entity is the related entity (foreign keys pointing TO this record)
    const relationships = this.entity.RelatedEntities;

    if (relationships.length === 0) {
      this.isLoadingRelationships = false;
      return;
    }

    // Build the filter using all primary key fields
    const pkFilter = this.record.PrimaryKey.ToWhereClause();
    if (!pkFilter) {
      this.isLoadingRelationships = false;
      return;
    }

    // Get the first PK value for the join field filter
    const pkValue = this.record.PrimaryKey.KeyValuePairs[0]?.Value;
    if (!pkValue) {
      this.isLoadingRelationships = false;
      return;
    }

    // Build batch query params for all relationships
    const viewParams: RunViewParams[] = relationships.map(rel => ({
      EntityName: rel.RelatedEntity,
      ExtraFilter: `${rel.RelatedEntityJoinField}='${pkValue}'`,
      ResultType: 'count_only'
    }));

    try {
      const rv = new RunView();
      const results = await rv.RunViews(viewParams);

      // Map results back to relationship data
      this.relatedEntities = relationships.map((rel, index) => {
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
      this.relatedEntities = relationships.map(rel => ({
        relationship: rel,
        relatedEntityName: rel.RelatedEntity,
        count: 0,
        isExpanded: false,
        records: [],
        isLoadingRecords: false
      }));
    } finally {
      this.isLoadingRelationships = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Get key fields to display in details section, categorized by type
   */
  get displayFields(): FieldDisplay[] {
    if (!this.entity || !this.record) return [];

    const fields: FieldDisplay[] = [];
    const excludePatterns = ['__mj_', 'password', 'secret', 'token'];

    for (const field of this.entity.Fields) {
      // Skip system fields and sensitive fields
      if (excludePatterns.some(p => field.Name.toLowerCase().includes(p))) continue;
      // Skip very long text fields (but not FK fields which are usually GUIDs)
      if (field.Length && field.Length > 500 && !field.RelatedEntityID) continue;

      const value = this.record.Get(field.Name);

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
      const mappedValue = this.record!.Get(field.RelatedEntityNameFieldMap);
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
          const virtualValue = this.record!.Get(virtualField.Name);
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
  get recordTitle(): string {
    if (!this.entity || !this.record) return 'Record';

    if (this.entity.NameField) {
      const name = this.record.Get(this.entity.NameField.Name);
      if (name) return String(name);
    }

    return this.record.PrimaryKey.ToString();
  }

  /**
   * Handle close button click
   */
  onClose(): void {
    this.close.emit();
  }

  /**
   * Handle open record button click
   */
  onOpenRecord(): void {
    if (this.record) {
      this.openRecord.emit(this.record);
    }
  }

  /**
   * Copy primary key value to clipboard
   */
  copyToClipboard(value: string, event: Event): void {
    event.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      // Could add a toast notification here
      console.log('Copied to clipboard:', value);
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  /**
   * Open a foreign key record (FK link click)
   * Emits openForeignKeyRecord event for parent to handle opening the record
   */
  onForeignKeyClick(field: FieldDisplay, event: Event): void {
    event.stopPropagation();
    if (field.relatedEntityName && field.relatedRecordId) {
      this.openForeignKeyRecord.emit({
        entityName: field.relatedEntityName,
        recordId: field.relatedRecordId
      });
    }
  }

  /**
   * Check if a FK display value is different from the raw ID (i.e., we have a name to show)
   */
  hasFriendlyName(field: FieldDisplay): boolean {
    return field.type === 'foreign-key' &&
           field.displayValue !== undefined &&
           field.displayValue !== field.value;
  }

  /**
   * Toggle expansion of related entity section and load records if needed
   */
  async toggleRelatedEntityExpansion(relEntity: RelatedEntityData, event: Event): Promise<void> {
    event.stopPropagation();

    if (relEntity.count === 0) return;

    relEntity.isExpanded = !relEntity.isExpanded;

    // Load records on first expansion
    if (relEntity.isExpanded && relEntity.records.length === 0 && !relEntity.isLoadingRecords) {
      await this.loadRelatedRecords(relEntity);
    }
  }

  /**
   * Load actual records for a related entity
   */
  private async loadRelatedRecords(relEntity: RelatedEntityData): Promise<void> {
    if (!this.record) return;

    const pkValue = this.record.PrimaryKey.KeyValuePairs[0]?.Value;
    if (!pkValue) return;

    relEntity.isLoadingRecords = true;

    try {
      const rv = new RunView();
      const result = await rv.RunView<BaseEntity>({
        EntityName: relEntity.relationship.RelatedEntity,
        ExtraFilter: `${relEntity.relationship.RelatedEntityJoinField}='${pkValue}'`,
        ResultType: 'entity_object',
        MaxRows: 10 // Limit inline display to 10 records
      });

      if (result.Success) {
        relEntity.records = result.Results;
      }
    } catch (error) {
      console.warn(`Failed to load records for ${relEntity.relatedEntityName}:`, error);
    } finally {
      relEntity.isLoadingRecords = false;
    }
  }

  /**
   * Handle click on individual related record - opens in new tab
   */
  onRelatedRecordClick(relEntity: RelatedEntityData, record: BaseEntity, event: Event): void {
    event.stopPropagation();
    this.openRelatedRecord.emit({
      entityName: relEntity.relatedEntityName,
      record
    });
  }

  /**
   * Navigate to view all related records (when count > 10)
   */
  onViewAllRelated(relEntity: RelatedEntityData, event: Event): void {
    event.stopPropagation();

    if (!this.record) return;

    const pkValue = this.record.PrimaryKey.KeyValuePairs[0]?.Value;
    if (!pkValue) return;

    this.navigateToRelated.emit({
      entityName: relEntity.relatedEntityName,
      filter: `${relEntity.relationship.RelatedEntityJoinField}='${pkValue}'`
    });
  }

  /**
   * Get display name for a related record
   */
  getRelatedRecordDisplayName(relEntity: RelatedEntityData, record: BaseEntity): string {
    const entityInfo = this.metadata.Entities.find(e => e.Name === relEntity.relatedEntityName);
    if (entityInfo?.NameField) {
      const name = record.Get(entityInfo.NameField.Name);
      if (name) return String(name);
    }
    return record.PrimaryKey.ToString();
  }

  /**
   * Get subtitle/secondary info for a related record
   */
  getRelatedRecordSubtitle(relEntity: RelatedEntityData, record: BaseEntity): string {
    const entityInfo = this.metadata.Entities.find(e => e.Name === relEntity.relatedEntityName);
    if (!entityInfo) return '';

    // Look for common subtitle fields
    const subtitleFieldNames = ['Description', 'Status', 'Type', 'Email', 'Date', 'Amount', 'Total'];
    for (const fieldName of subtitleFieldNames) {
      const field = entityInfo.Fields.find(f =>
        f.Name.includes(fieldName) && f.Name !== entityInfo.NameField?.Name
      );
      if (field) {
        const value = record.Get(field.Name);
        if (value !== null && value !== undefined) {
          return this.formatFieldValue(value, field.Name);
        }
      }
    }
    return '';
  }

  /**
   * Toggle section expansion
   */
  toggleSection(section: 'details' | 'relationships'): void {
    if (section === 'details') {
      this.detailsSectionExpanded = !this.detailsSectionExpanded;
    } else {
      this.relationshipsSectionExpanded = !this.relationshipsSectionExpanded;
    }
  }

  /**
   * Get only related entities that have records (count > 0)
   */
  get relatedEntitiesWithRecords(): RelatedEntityData[] {
    return this.relatedEntities.filter(r => r.count > 0);
  }

  /**
   * Get icon for related entity by looking up EntityInfo from Metadata
   */
  getRelatedEntityIcon(relEntity: RelatedEntityData): string {
    const entityInfo = this.metadata.Entities.find(e => e.Name === relEntity.relatedEntityName);
    if (entityInfo?.Icon) {
      return this.formatEntityIcon(entityInfo.Icon);
    }
    return 'fa-solid fa-table';
  }

  /**
   * Get the icon class for the current entity
   */
  getEntityIconClass(): string {
    if (!this.entity?.Icon) {
      return 'fa-solid fa-table';
    }
    return this.formatEntityIcon(this.entity.Icon);
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
