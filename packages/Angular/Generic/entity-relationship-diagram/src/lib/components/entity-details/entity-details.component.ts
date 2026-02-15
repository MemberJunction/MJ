import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild, ElementRef } from '@angular/core';
import { EntityInfo, EntityFieldInfo, EntityFieldValueInfo, Metadata } from '@memberjunction/core';

/**
 * Event emitted when requesting to open an entity record.
 */
export interface EntityDetailsOpenRecordEvent {
  EntityName: string;
  RecordID: string;
}

/**
 * Entity details panel component that displays detailed information about a selected entity.
 * Shows entity metadata, fields with filtering capabilities, and related entities.
 *
 * This component is designed to be used alongside the ERD diagram to provide
 * a detailed view of the currently selected entity.
 */
@Component({
  standalone: false,
  selector: 'mj-entity-details',
  templateUrl: './entity-details.component.html',
  styleUrls: ['./entity-details.component.css']
})
export class EntityDetailsComponent implements OnChanges {
  @ViewChild('fieldsListContainer', { static: false }) fieldsListContainer!: ElementRef;
  @ViewChild('relationshipsListContainer', { static: false }) relationshipsListContainer!: ElementRef;

  /** The currently selected entity to display details for */
  @Input() selectedEntity: EntityInfo | null = null;

  /** All entity fields for looking up field information */
  @Input() allEntityFields: EntityFieldInfo[] = [];

  /** Whether the fields section is expanded */
  @Input() fieldsSectionExpanded = true;

  /** Whether the relationships section is expanded */
  @Input() relationshipsSectionExpanded = true;

  /** Emitted when user clicks to open the entity record */
  @Output() openEntity = new EventEmitter<EntityInfo>();

  /** Emitted when user clicks the close button */
  @Output() closePanel = new EventEmitter<void>();

  /** Emitted when fields section is toggled */
  @Output() fieldsSectionToggle = new EventEmitter<void>();

  /** Emitted when relationships section is toggled */
  @Output() relationshipsSectionToggle = new EventEmitter<void>();

  /** Emitted when a related entity is selected (clicked in relationships list) */
  @Output() entitySelected = new EventEmitter<EntityInfo>();

  /** Emitted when requesting to open an entity record */
  @Output() openRecord = new EventEmitter<EntityDetailsOpenRecordEvent>();

  public fieldFilter: 'all' | 'keys' | 'foreign_keys' | 'regular' = 'all';
  public expandedFieldDescriptions = new Set<string>();
  public expandedFieldValues = new Set<string>();
  public expandedFieldDetails = new Set<string>();
  private previousSelectedEntityId: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedEntity'] && !changes['selectedEntity'].firstChange) {
      const currentEntityId = this.selectedEntity?.ID || null;

      // Check if entity actually changed
      if (currentEntityId !== this.previousSelectedEntityId) {
        // Reset scroll positions when entity changes
        this.resetScrollPositions();

        this.previousSelectedEntityId = currentEntityId;
      }
    }
  }

  private resetScrollPositions(): void {
    // Use setTimeout to ensure the DOM is updated
    setTimeout(() => {
      if (this.fieldsListContainer?.nativeElement) {
        this.fieldsListContainer.nativeElement.scrollTop = 0;
      }
      if (this.relationshipsListContainer?.nativeElement) {
        this.relationshipsListContainer.nativeElement.scrollTop = 0;
      }
    }, 0);
  }

  public onOpenEntity(): void {
    if (this.selectedEntity) {
      this.openRecord.emit({
        EntityName: 'MJ: Entities',
        RecordID: this.selectedEntity.ID
      });
    }
  }

  public onClosePanel(): void {
    this.closePanel.emit();
  }

  public toggleFieldsSection(): void {
    this.fieldsSectionToggle.emit();
  }

  public toggleRelationshipsSection(): void {
    this.relationshipsSectionToggle.emit();
  }

  public setFieldFilter(filter: 'all' | 'keys' | 'foreign_keys' | 'regular'): void {
    this.fieldFilter = filter;
  }

  public getEntityFields(entityId: string): EntityFieldInfo[] {
    if (!entityId) return [];

    let fields = this.allEntityFields.filter(f => f.EntityID === entityId);

    switch (this.fieldFilter) {
      case 'keys':
        return fields.filter(f => f.IsPrimaryKey || f.Name.toLowerCase().includes('id'));
      case 'foreign_keys':
        return fields.filter(f => f.RelatedEntityID && !f.IsPrimaryKey);
      case 'regular':
        return fields.filter(f => !f.IsPrimaryKey && !f.RelatedEntityID);
      default:
        return fields;
    }
  }

  public getRelatedEntities(entityId: string): EntityInfo[] {
    if (!entityId) return [];

    const relatedEntityIds = new Set<string>();

    // Get entities that this entity references (foreign keys)
    this.allEntityFields
      .filter(f => f.EntityID === entityId && f.RelatedEntityID)
      .forEach(f => relatedEntityIds.add(f.RelatedEntityID!));

    // Get entities that reference this entity
    this.allEntityFields
      .filter(f => f.RelatedEntityID === entityId)
      .forEach(f => relatedEntityIds.add(f.EntityID));

    // Remove the current entity from the set (don't return self-references)
    relatedEntityIds.delete(entityId);

    // Convert to actual EntityInfo objects
    const md = new Metadata();
    const allEntities = md.Entities;
    const retVals: EntityInfo[] = [];
    relatedEntityIds.forEach(id => {
      const entity = allEntities.find(e => e.ID === id);
      if (entity) {
        retVals.push(entity);
      }
    });
    return retVals;
  }

  public onFieldClick(field: EntityFieldInfo): void {
    this.toggleFieldDetails(field.ID);
  }

  public toggleFieldDescription(fieldId: string): void {
    if (this.expandedFieldDescriptions.has(fieldId)) {
      this.expandedFieldDescriptions.delete(fieldId);
    } else {
      this.expandedFieldDescriptions.add(fieldId);
    }
  }

  public toggleFieldValues(fieldId: string): void {
    if (this.expandedFieldValues.has(fieldId)) {
      this.expandedFieldValues.delete(fieldId);
    } else {
      this.expandedFieldValues.add(fieldId);
    }
  }

  public toggleFieldDetails(fieldId: string): void {
    if (this.expandedFieldDetails.has(fieldId)) {
      this.expandedFieldDetails.delete(fieldId);
    } else {
      this.expandedFieldDetails.add(fieldId);
    }
  }

  public isFieldDescriptionExpanded(fieldId: string): boolean {
    return this.expandedFieldDescriptions.has(fieldId);
  }

  public isFieldValuesExpanded(fieldId: string): boolean {
    return this.expandedFieldValues.has(fieldId);
  }

  public isFieldDetailsExpanded(fieldId: string): boolean {
    return this.expandedFieldDetails.has(fieldId);
  }

  public hasFieldPossibleValues(field: EntityFieldInfo): boolean {
    return field.EntityFieldValues && field.EntityFieldValues.length > 0;
  }

  public getFieldPossibleValues(field: EntityFieldInfo): string[] {
    if (!field.EntityFieldValues) return [];
    return field.EntityFieldValues.map(v => v.Value).slice(0, 10);
  }

  public getSortedEntityFieldValues(field: EntityFieldInfo): EntityFieldValueInfo[] {
    if (!field.EntityFieldValues) return [];
    return field.EntityFieldValues.sort((a, b) => {
      if (a.Sequence !== undefined && b.Sequence !== undefined) {
        return a.Sequence - b.Sequence;
      }
      return a.Value.localeCompare(b.Value);
    });
  }

  public onRelatedEntityClick(event: Event, field: EntityFieldInfo): void {
    event.stopPropagation();
    if (field.RelatedEntityID) {
      // Find the related entity and select it in the ERD
      const md = new Metadata();
      const relatedEntity = md.Entities.find(e => e.ID === field.RelatedEntityID);
      if (relatedEntity) {
        this.entitySelected.emit(relatedEntity);
      }
    }
  }

  public selectEntity(entity: EntityInfo, _zoomTo: boolean = false): void {
    this.entitySelected.emit(entity);
  }
}
