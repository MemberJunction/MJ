import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EntityInfo, EntityFieldInfo, EntityFieldValueInfo, Metadata } from '@memberjunction/core';

@Component({
  selector: 'mj-entity-details',
  templateUrl: './entity-details.component.html',
  styleUrls: ['./entity-details.component.scss']
})
export class EntityDetailsComponent implements OnInit {
  @Input() selectedEntity: EntityInfo | null = null;
  @Input() allEntityFields: EntityFieldInfo[] = [];
  @Input() fieldsSectionExpanded = true;
  @Input() relationshipsSectionExpanded = true;

  @Output() openEntity = new EventEmitter<EntityInfo>();
  @Output() closePanel = new EventEmitter<void>();
  @Output() fieldsSectionToggle = new EventEmitter<void>();
  @Output() relationshipsSectionToggle = new EventEmitter<void>();
  @Output() entitySelected = new EventEmitter<EntityInfo>();
  @Output() openRecord = new EventEmitter<{EntityName: string, RecordID: string}>();

  public fieldFilter: 'all' | 'keys' | 'foreign_keys' | 'regular' = 'all';
  public expandedFieldDescriptions = new Set<string>();
  public expandedFieldValues = new Set<string>();
  public expandedFieldDetails = new Set<string>();

  ngOnInit(): void {
    // Component initialization
  }

  public onOpenEntity(): void {
    if (this.selectedEntity) {
      this.openEntity.emit(this.selectedEntity);
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
    
    const relatedEntityIds = new Array<string>();
    
    // Get entities that this entity references (foreign keys)
    this.allEntityFields
      .filter(f => f.EntityID === entityId && f.RelatedEntityID)
      .forEach(f => relatedEntityIds.push(f.RelatedEntityID!));
    
    // Get entities that reference this entity
    this.allEntityFields
      .filter(f => f.RelatedEntityID === entityId)
      .forEach(f => relatedEntityIds.push(f.EntityID));
    
    // Convert to actual EntityInfo objects (would need entities list passed in)
    // For now, returning empty array as we'd need the full entities list
    const md = new Metadata();
    const allEntities = md.Entities;
    const retVals: EntityInfo[] = [];
    relatedEntityIds.forEach(id => {
      if (id !== entityId) {
        // don't return the current entity itself
        const entity = allEntities.find(e => e.ID === id);
        if (entity) {
          retVals.push(entity);
        }
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
    if (field.RelatedEntity) {
      this.openRecord.emit({
        EntityName: field.RelatedEntity,
        RecordID: field.RelatedEntityID || ''
      });
    }
  }

  public selectEntity(entity: EntityInfo, zoomTo: boolean = false): void {
    this.entitySelected.emit(entity);
  }
}