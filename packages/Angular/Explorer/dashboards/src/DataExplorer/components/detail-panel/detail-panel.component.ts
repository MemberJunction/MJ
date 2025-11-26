import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { EntityInfo, EntityRelationshipInfo, RunView } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';

interface RelatedEntityCount {
  relationship: EntityRelationshipInfo;
  relatedEntityName: string;
  count: number;
  isLoading: boolean;
}

@Component({
  selector: 'mj-explorer-detail-panel',
  templateUrl: './detail-panel.component.html',
  styleUrls: ['./detail-panel.component.scss']
})
export class DetailPanelComponent implements OnChanges {
  @Input() entity: EntityInfo | null = null;
  @Input() record: BaseEntity | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() openRecord = new EventEmitter<BaseEntity>();
  @Output() navigateToRelated = new EventEmitter<{ entity: EntityInfo; filter: string }>();

  // Related entity counts
  public relatedEntities: RelatedEntityCount[] = [];
  public isLoadingRelationships = false;

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

    // Initialize relationship counts
    for (const rel of relationships) {
      this.relatedEntities.push({
        relationship: rel,
        relatedEntityName: rel.RelatedEntity,
        count: 0,
        isLoading: true
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
   * Handle click on related entity
   */
  onRelatedEntityClick(relEntity: RelatedEntityCount): void {
    if (relEntity.count === 0 || !this.record) return;

    const pkValue = this.record.PrimaryKey.KeyValuePairs[0]?.Value;
    if (!pkValue) return;

    // Find the related entity info
    // For now, just emit the navigation request
    // The parent component will handle the actual navigation
    this.navigateToRelated.emit({
      entity: relEntity.relationship as unknown as EntityInfo, // Will need proper lookup
      filter: `${relEntity.relationship.RelatedEntityJoinField}='${pkValue}'`
    });
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
   * Get icon for related entity
   */
  getRelatedEntityIcon(relEntity: RelatedEntityCount): string {
    // Would need to look up the entity to get its icon
    return 'fa-solid fa-table';
  }
}
