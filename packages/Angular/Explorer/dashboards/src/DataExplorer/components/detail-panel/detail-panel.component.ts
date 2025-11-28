import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { EntityInfo, EntityRelationshipInfo, RunView, Metadata } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';

interface RelatedEntityData {
  relationship: EntityRelationshipInfo;
  relatedEntityName: string;
  count: number;
  isLoading: boolean;
  isExpanded: boolean;
  records: BaseEntity[];
  isLoadingRecords: boolean;
}

/**
 * Event emitted when navigating to a related entity
 */
export interface NavigateToRelatedEvent {
  entityName: string;
  filter: string;
}

@Component({
  selector: 'mj-explorer-detail-panel',
  templateUrl: './detail-panel.component.html',
  styleUrls: ['./detail-panel.component.css']
})
export class DetailPanelComponent implements OnChanges {
  @Input() entity: EntityInfo | null = null;
  @Input() record: BaseEntity | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() openRecord = new EventEmitter<BaseEntity>();
  @Output() navigateToRelated = new EventEmitter<NavigateToRelatedEvent>();
  @Output() openRelatedRecord = new EventEmitter<{ entityName: string; record: BaseEntity }>();

  // Related entity counts
  public relatedEntities: RelatedEntityData[] = [];
  public isLoadingRelationships = false;

  private metadata = new Metadata();

  // Sections expanded state
  public detailsSectionExpanded = true;
  public relationshipsSectionExpanded = true;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['record'] && this.record && this.entity) {
      this.loadRelationshipCounts();
    }
  }

  /**
   * Load counts for related entities
   */
  private async loadRelationshipCounts(): Promise<void> {
    if (!this.entity || !this.record) return;

    this.isLoadingRelationships = true;
    this.relatedEntities = [];

    // Get relationships where this entity is the related entity (foreign keys pointing TO this record)
    const relationships = this.entity.RelatedEntities;

    // Initialize relationship data
    for (const rel of relationships) {
      this.relatedEntities.push({
        relationship: rel,
        relatedEntityName: rel.RelatedEntity,
        count: 0,
        isLoading: true,
        isExpanded: false,
        records: [],
        isLoadingRecords: false
      });
    }

    // Load counts in parallel
    const rv = new RunView();
    const countPromises = this.relatedEntities.map(async (relEntity) => {
      try {
        const pkValue = this.record!.PrimaryKey.KeyValuePairs[0]?.Value;
        if (!pkValue) {
          relEntity.count = 0;
          relEntity.isLoading = false;
          return;
        }

        const result = await rv.RunView({
          EntityName: relEntity.relationship.RelatedEntity,
          ExtraFilter: `${relEntity.relationship.RelatedEntityJoinField}='${pkValue}'`,
          ResultType: 'count_only'
        });

        if (result.Success) {
          relEntity.count = result.TotalRowCount;
        }
      } catch (error) {
        console.warn(`Failed to load count for ${relEntity.relatedEntityName}:`, error);
        relEntity.count = 0;
      } finally {
        relEntity.isLoading = false;
      }
    });

    await Promise.all(countPromises);
    this.isLoadingRelationships = false;
  }

  /**
   * Get key fields to display in details section
   */
  get displayFields(): { name: string; label: string; value: string }[] {
    if (!this.entity || !this.record) return [];

    const fields: { name: string; label: string; value: string }[] = [];
    const excludePatterns = ['__mj_', 'password', 'secret', 'token'];

    for (const field of this.entity.Fields) {
      // Skip system fields and sensitive fields
      if (excludePatterns.some(p => field.Name.toLowerCase().includes(p))) continue;
      // Skip very long text fields
      if (field.Length && field.Length > 500) continue;
      // Limit to reasonable number of fields
      if (fields.length >= 10) break;

      const value = this.record.Get(field.Name);
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        fields.push({
          name: field.Name,
          label: this.formatFieldLabel(field.Name),
          value: this.formatFieldValue(value, field.Name)
        });
      }
    }

    return fields;
  }

  /**
   * Format field name to display label
   */
  private formatFieldLabel(fieldName: string): string {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
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
    return this.relatedEntities.filter(r => r.count > 0 || r.isLoading);
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
