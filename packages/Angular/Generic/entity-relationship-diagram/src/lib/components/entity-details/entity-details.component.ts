import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild, ElementRef } from '@angular/core';
import { EntityInfo, EntityFieldInfo, EntityFieldValueInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

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
export class EntityDetailsComponent extends BaseAngularComponent implements OnChanges {
  @ViewChild('fieldsListContainer', { static: false }) fieldsListContainer!: ElementRef;
  @ViewChild('relationshipsListContainer', { static: false }) relationshipsListContainer!: ElementRef;

  /** The currently selected entity to display details for */
  @Input() SelectedEntity: EntityInfo | null = null;

  /** @deprecated Use {@link SelectedEntity}. */
  @Input() set selectedEntity(value: EntityInfo | null) {
    this.SelectedEntity = value;
  }
  /** @deprecated Use {@link SelectedEntity}. */
  get selectedEntity(): EntityInfo | null {
    return this.SelectedEntity;
  }

  /** All entity fields for looking up field information */
  @Input() AllEntityFields: EntityFieldInfo[] = [];

  /** @deprecated Use {@link AllEntityFields}. */
  @Input() set allEntityFields(value: EntityFieldInfo[]) {
    this.AllEntityFields = value;
  }
  /** @deprecated Use {@link AllEntityFields}. */
  get allEntityFields(): EntityFieldInfo[] {
    return this.AllEntityFields;
  }

  /** Whether the fields section is expanded */
  @Input() FieldsSectionExpanded = true;

  /** @deprecated Use {@link FieldsSectionExpanded}. */
  @Input() set fieldsSectionExpanded(value: EntityDetailsComponent['FieldsSectionExpanded']) {
    this.FieldsSectionExpanded = value;
  }
  /** @deprecated Use {@link FieldsSectionExpanded}. */
  get fieldsSectionExpanded(): EntityDetailsComponent['FieldsSectionExpanded'] {
    return this.FieldsSectionExpanded;
  }

  /** Whether the relationships section is expanded */
  @Input() RelationshipsSectionExpanded = true;

  /** @deprecated Use {@link RelationshipsSectionExpanded}. */
  @Input() set relationshipsSectionExpanded(value: EntityDetailsComponent['RelationshipsSectionExpanded']) {
    this.RelationshipsSectionExpanded = value;
  }
  /** @deprecated Use {@link RelationshipsSectionExpanded}. */
  get relationshipsSectionExpanded(): EntityDetailsComponent['RelationshipsSectionExpanded'] {
    return this.RelationshipsSectionExpanded;
  }

  /** Emitted when user clicks to open the entity record */
  @Output() OpenEntity = new EventEmitter<EntityInfo>();

  /**
   * @deprecated Use {@link OpenEntity}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openEntity) keeps working. Must stay AFTER OpenEntity: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openEntity = this.OpenEntity;

  /** Emitted when user clicks the close button */
  @Output() ClosePanel = new EventEmitter<void>();

  /**
   * @deprecated Use {@link ClosePanel}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (closePanel) keeps working. Must stay AFTER ClosePanel: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() closePanel = this.ClosePanel;

  /** Emitted when fields section is toggled */
  @Output() FieldsSectionToggle = new EventEmitter<void>();

  /**
   * @deprecated Use {@link FieldsSectionToggle}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (fieldsSectionToggle) keeps working. Must stay AFTER FieldsSectionToggle: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() fieldsSectionToggle = this.FieldsSectionToggle;

  /** Emitted when relationships section is toggled */
  @Output() RelationshipsSectionToggle = new EventEmitter<void>();

  /**
   * @deprecated Use {@link RelationshipsSectionToggle}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (relationshipsSectionToggle) keeps working. Must stay AFTER RelationshipsSectionToggle: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() relationshipsSectionToggle = this.RelationshipsSectionToggle;

  /** Emitted when a related entity is selected (clicked in relationships list) */
  @Output() EntitySelected = new EventEmitter<EntityInfo>();

  /**
   * @deprecated Use {@link EntitySelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (entitySelected) keeps working. Must stay AFTER EntitySelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() entitySelected = this.EntitySelected;

  /** Emitted when requesting to open an entity record */
  @Output() OpenRecord = new EventEmitter<EntityDetailsOpenRecordEvent>();

  /**
   * @deprecated Use {@link OpenRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openRecord) keeps working. Must stay AFTER OpenRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openRecord = this.OpenRecord;

  public FieldFilter: 'all' | 'keys' | 'foreign_keys' | 'regular' = 'all';

  /** @deprecated Use {@link FieldFilter}. */
  public get fieldFilter(): 'all' | 'keys' | 'foreign_keys' | 'regular' {
    return this.FieldFilter;
  }
  /** @deprecated Use {@link FieldFilter}. */
  public set fieldFilter(value: 'all' | 'keys' | 'foreign_keys' | 'regular') {
    this.FieldFilter = value;
  }
  public ExpandedFieldDescriptions = new Set<string>();

  /** @deprecated Use {@link ExpandedFieldDescriptions}. */
  public get expandedFieldDescriptions() {
    return this.ExpandedFieldDescriptions;
  }
  /** @deprecated Use {@link ExpandedFieldDescriptions}. */
  public set expandedFieldDescriptions(value) {
    this.ExpandedFieldDescriptions = value;
  }
  public ExpandedFieldValues = new Set<string>();

  /** @deprecated Use {@link ExpandedFieldValues}. */
  public get expandedFieldValues() {
    return this.ExpandedFieldValues;
  }
  /** @deprecated Use {@link ExpandedFieldValues}. */
  public set expandedFieldValues(value) {
    this.ExpandedFieldValues = value;
  }
  public ExpandedFieldDetails = new Set<string>();

  /** @deprecated Use {@link ExpandedFieldDetails}. */
  public get expandedFieldDetails() {
    return this.ExpandedFieldDetails;
  }
  /** @deprecated Use {@link ExpandedFieldDetails}. */
  public set expandedFieldDetails(value) {
    this.ExpandedFieldDetails = value;
  }
  private previousSelectedEntityId: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedEntity'] && !changes['selectedEntity'].firstChange) {
      const currentEntityId = this.SelectedEntity?.ID || null;

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

  public OnOpenEntity(): void {
    if (this.SelectedEntity) {
      this.OpenRecord.emit({
        EntityName: 'MJ: Entities',
        RecordID: this.SelectedEntity.ID
      });
    }
  }

  /** @deprecated Use {@link OnOpenEntity}. */
  public onOpenEntity(): void {
    return this.OnOpenEntity();
  }

  public OnClosePanel(): void {
    this.ClosePanel.emit();
  }

  /** @deprecated Use {@link OnClosePanel}. */
  public onClosePanel(): void {
    return this.OnClosePanel();
  }

  public ToggleFieldsSection(): void {
    this.FieldsSectionToggle.emit();
  }

  /** @deprecated Use {@link ToggleFieldsSection}. */
  public toggleFieldsSection(): void {
    return this.ToggleFieldsSection();
  }

  public ToggleRelationshipsSection(): void {
    this.RelationshipsSectionToggle.emit();
  }

  /** @deprecated Use {@link ToggleRelationshipsSection}. */
  public toggleRelationshipsSection(): void {
    return this.ToggleRelationshipsSection();
  }

  public SetFieldFilter(filter: 'all' | 'keys' | 'foreign_keys' | 'regular'): void {
    this.FieldFilter = filter;
  }

  /** @deprecated Use {@link SetFieldFilter}. */
  public setFieldFilter(filter: 'all' | 'keys' | 'foreign_keys' | 'regular'): void {
    return this.SetFieldFilter(filter);
  }

  public GetEntityFields(entityId: string): EntityFieldInfo[] {
    if (!entityId) return [];

    let fields = this.AllEntityFields.filter(f => UUIDsEqual(f.EntityID, entityId));

    switch (this.FieldFilter) {
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

  /** @deprecated Use {@link GetEntityFields}. */
  public getEntityFields(entityId: string): EntityFieldInfo[] {
    return this.GetEntityFields(entityId);
  }

  public GetRelatedEntities(entityId: string): EntityInfo[] {
    if (!entityId) return [];

    const relatedEntityIds = new Set<string>();

    // Get entities that this entity references (foreign keys)
    this.AllEntityFields
      .filter(f => UUIDsEqual(f.EntityID, entityId) && f.RelatedEntityID)
      .forEach(f => relatedEntityIds.add(f.RelatedEntityID!));

    // Get entities that reference this entity
    this.AllEntityFields
      .filter(f => UUIDsEqual(f.RelatedEntityID, entityId))
      .forEach(f => relatedEntityIds.add(f.EntityID));

    // Remove the current entity from the set (don't return self-references)
    relatedEntityIds.delete(entityId);

    // Convert to actual EntityInfo objects
    const md = this.ProviderToUse;
    const allEntities = md.Entities;
    const retVals: EntityInfo[] = [];
    relatedEntityIds.forEach(id => {
      const entity = allEntities.find(e => UUIDsEqual(e.ID, id));
      if (entity) {
        retVals.push(entity);
      }
    });
    return retVals;
  }

  /** @deprecated Use {@link GetRelatedEntities}. */
  public getRelatedEntities(entityId: string): EntityInfo[] {
    return this.GetRelatedEntities(entityId);
  }

  public OnFieldClick(field: EntityFieldInfo): void {
    this.ToggleFieldDetails(field.ID);
  }

  /** @deprecated Use {@link OnFieldClick}. */
  public onFieldClick(field: EntityFieldInfo): void {
    return this.OnFieldClick(field);
  }

  public ToggleFieldDescription(fieldId: string): void {
    if (this.ExpandedFieldDescriptions.has(fieldId)) {
      this.ExpandedFieldDescriptions.delete(fieldId);
    } else {
      this.ExpandedFieldDescriptions.add(fieldId);
    }
  }

  /** @deprecated Use {@link ToggleFieldDescription}. */
  public toggleFieldDescription(fieldId: string): void {
    return this.ToggleFieldDescription(fieldId);
  }

  public ToggleFieldValues(fieldId: string): void {
    if (this.ExpandedFieldValues.has(fieldId)) {
      this.ExpandedFieldValues.delete(fieldId);
    } else {
      this.ExpandedFieldValues.add(fieldId);
    }
  }

  /** @deprecated Use {@link ToggleFieldValues}. */
  public toggleFieldValues(fieldId: string): void {
    return this.ToggleFieldValues(fieldId);
  }

  public ToggleFieldDetails(fieldId: string): void {
    if (this.ExpandedFieldDetails.has(fieldId)) {
      this.ExpandedFieldDetails.delete(fieldId);
    } else {
      this.ExpandedFieldDetails.add(fieldId);
    }
  }

  /** @deprecated Use {@link ToggleFieldDetails}. */
  public toggleFieldDetails(fieldId: string): void {
    return this.ToggleFieldDetails(fieldId);
  }

  public IsFieldDescriptionExpanded(fieldId: string): boolean {
    return this.ExpandedFieldDescriptions.has(fieldId);
  }

  /** @deprecated Use {@link IsFieldDescriptionExpanded}. */
  public isFieldDescriptionExpanded(fieldId: string): boolean {
    return this.IsFieldDescriptionExpanded(fieldId);
  }

  public IsFieldValuesExpanded(fieldId: string): boolean {
    return this.ExpandedFieldValues.has(fieldId);
  }

  /** @deprecated Use {@link IsFieldValuesExpanded}. */
  public isFieldValuesExpanded(fieldId: string): boolean {
    return this.IsFieldValuesExpanded(fieldId);
  }

  public IsFieldDetailsExpanded(fieldId: string): boolean {
    return this.ExpandedFieldDetails.has(fieldId);
  }

  /** @deprecated Use {@link IsFieldDetailsExpanded}. */
  public isFieldDetailsExpanded(fieldId: string): boolean {
    return this.IsFieldDetailsExpanded(fieldId);
  }

  public HasFieldPossibleValues(field: EntityFieldInfo): boolean {
    return field.EntityFieldValues && field.EntityFieldValues.length > 0;
  }

  /** @deprecated Use {@link HasFieldPossibleValues}. */
  public hasFieldPossibleValues(field: EntityFieldInfo): boolean {
    return this.HasFieldPossibleValues(field);
  }

  public GetFieldPossibleValues(field: EntityFieldInfo): string[] {
    if (!field.EntityFieldValues) return [];
    return field.EntityFieldValues.map(v => v.Value).slice(0, 10);
  }

  /** @deprecated Use {@link GetFieldPossibleValues}. */
  public getFieldPossibleValues(field: EntityFieldInfo): string[] {
    return this.GetFieldPossibleValues(field);
  }

  public GetSortedEntityFieldValues(field: EntityFieldInfo): EntityFieldValueInfo[] {
    if (!field.EntityFieldValues) return [];
    return field.EntityFieldValues.sort((a, b) => {
      if (a.Sequence !== undefined && b.Sequence !== undefined) {
        return a.Sequence - b.Sequence;
      }
      return a.Value.localeCompare(b.Value);
    });
  }

  /** @deprecated Use {@link GetSortedEntityFieldValues}. */
  public getSortedEntityFieldValues(field: EntityFieldInfo): EntityFieldValueInfo[] {
    return this.GetSortedEntityFieldValues(field);
  }

  public OnRelatedEntityClick(event: Event, field: EntityFieldInfo): void {
    event.stopPropagation();
    if (field.RelatedEntityID) {
      // Find the related entity and select it in the ERD
      const md = this.ProviderToUse;
      const relatedEntity = md.Entities.find(e => UUIDsEqual(e.ID, field.RelatedEntityID));
      if (relatedEntity) {
        this.EntitySelected.emit(relatedEntity);
      }
    }
  }

  /** @deprecated Use {@link OnRelatedEntityClick}. */
  public onRelatedEntityClick(event: Event, field: EntityFieldInfo): void {
    return this.OnRelatedEntityClick(event, field);
  }

  public SelectEntity(entity: EntityInfo, _zoomTo: boolean = false): void {
    this.EntitySelected.emit(entity);
  }

  /** @deprecated Use {@link SelectEntity}. */
  public selectEntity(entity: EntityInfo, _zoomTo: boolean = false): void {
    return this.SelectEntity(entity, _zoomTo);
  }
}
