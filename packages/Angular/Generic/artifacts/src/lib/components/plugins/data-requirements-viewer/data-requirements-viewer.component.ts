import { Component, Input } from '@angular/core';
import { ComponentDataRequirements, ComponentEntityDataRequirement, ComponentQueryDataRequirement, SimpleEntityFieldInfo } from '@memberjunction/interactive-component-types';

/**
 * Beautiful viewer component for ComponentDataRequirements.
 * Displays entities, queries, and fields in an organized, visually appealing layout.
 */
@Component({
  standalone: false,
  selector: 'mj-data-requirements-viewer',
  templateUrl: './data-requirements-viewer.component.html',
  styleUrls: ['./data-requirements-viewer.component.css']
})
export class DataRequirementsViewerComponent {
  @Input() DataRequirements: ComponentDataRequirements | null = null;

  /** @deprecated Use {@link DataRequirements}. */
  @Input() set dataRequirements(value: ComponentDataRequirements | null) {
    this.DataRequirements = value;
  }
  /** @deprecated Use {@link DataRequirements}. */
  get dataRequirements(): ComponentDataRequirements | null {
    return this.DataRequirements;
  }

  // Track expanded state for entities and queries
  ExpandedEntities: Set<string> = new Set();

  /** @deprecated Use {@link ExpandedEntities}. */
  get expandedEntities(): Set<string> {
    return this.ExpandedEntities;
  }
  /** @deprecated Use {@link ExpandedEntities}. */
  set expandedEntities(value: Set<string>) {
    this.ExpandedEntities = value;
  }
  ExpandedQueries: Set<string> = new Set();

  /** @deprecated Use {@link ExpandedQueries}. */
  get expandedQueries(): Set<string> {
    return this.ExpandedQueries;
  }
  /** @deprecated Use {@link ExpandedQueries}. */
  set expandedQueries(value: Set<string>) {
    this.ExpandedQueries = value;
  }

  get HasData(): boolean {
    return !!this.DataRequirements;
  }

  /** @deprecated Use {@link HasData}. */
  get hasData(): boolean {
    return this.HasData;
  }

  get Mode(): string {
    return this.DataRequirements?.mode || 'views';
  }

  /** @deprecated Use {@link Mode}. */
  get mode(): string {
    return this.Mode;
  }

  get ModeLabel(): string {
    switch (this.Mode) {
      case 'views': return 'Entity Views';
      case 'queries': return 'Stored Queries';
      case 'hybrid': return 'Hybrid (Views + Queries)';
      default: return this.Mode;
    }
  }

  /** @deprecated Use {@link ModeLabel}. */
  get modeLabel(): string {
    return this.ModeLabel;
  }

  get ModeIcon(): string {
    switch (this.Mode) {
      case 'views': return 'fa-table';
      case 'queries': return 'fa-database';
      case 'hybrid': return 'fa-layer-group';
      default: return 'fa-database';
    }
  }

  /** @deprecated Use {@link ModeIcon}. */
  get modeIcon(): string {
    return this.ModeIcon;
  }

  get Entities(): ComponentEntityDataRequirement[] {
    return this.DataRequirements?.entities || [];
  }

  /** @deprecated Use {@link Entities}. */
  get entities(): ComponentEntityDataRequirement[] {
    return this.Entities;
  }

  get Queries(): ComponentQueryDataRequirement[] {
    return this.DataRequirements?.queries || [];
  }

  /** @deprecated Use {@link Queries}. */
  get queries(): ComponentQueryDataRequirement[] {
    return this.Queries;
  }

  get Description(): string {
    return this.DataRequirements?.description || '';
  }

  /** @deprecated Use {@link Description}. */
  get description(): string {
    return this.Description;
  }

  get TotalFieldCount(): number {
    let count = 0;
    for (const entity of this.Entities) {
      count += entity.fieldMetadata?.length || 0;
    }
    for (const query of this.Queries) {
      count += query.fields?.length || 0;
    }
    return count;
  }

  /** @deprecated Use {@link TotalFieldCount}. */
  get totalFieldCount(): number {
    return this.TotalFieldCount;
  }

  ToggleEntity(entityName: string): void {
    if (this.ExpandedEntities.has(entityName)) {
      this.ExpandedEntities.delete(entityName);
    } else {
      this.ExpandedEntities.add(entityName);
    }
  }

  /** @deprecated Use {@link ToggleEntity}. */
  toggleEntity(entityName: string): void {
    return this.ToggleEntity(entityName);
  }

  ToggleQuery(queryKey: string): void {
    if (this.ExpandedQueries.has(queryKey)) {
      this.ExpandedQueries.delete(queryKey);
    } else {
      this.ExpandedQueries.add(queryKey);
    }
  }

  /** @deprecated Use {@link ToggleQuery}. */
  toggleQuery(queryKey: string): void {
    return this.ToggleQuery(queryKey);
  }

  IsEntityExpanded(entityName: string): boolean {
    return this.ExpandedEntities.has(entityName);
  }

  /** @deprecated Use {@link IsEntityExpanded}. */
  isEntityExpanded(entityName: string): boolean {
    return this.IsEntityExpanded(entityName);
  }

  IsQueryExpanded(queryKey: string): boolean {
    return this.ExpandedQueries.has(queryKey);
  }

  /** @deprecated Use {@link IsQueryExpanded}. */
  isQueryExpanded(queryKey: string): boolean {
    return this.IsQueryExpanded(queryKey);
  }

  GetQueryKey(query: ComponentQueryDataRequirement): string {
    return `${query.categoryPath}/${query.name}`;
  }

  /** @deprecated Use {@link GetQueryKey}. */
  getQueryKey(query: ComponentQueryDataRequirement): string {
    return this.GetQueryKey(query);
  }

  GetPermissionIcon(permission: string): string {
    switch (permission) {
      case 'read': return 'fa-eye';
      case 'create': return 'fa-plus';
      case 'update': return 'fa-pen';
      case 'delete': return 'fa-trash';
      default: return 'fa-question';
    }
  }

  /** @deprecated Use {@link GetPermissionIcon}. */
  getPermissionIcon(permission: string): string {
    return this.GetPermissionIcon(permission);
  }

  GetPermissionColor(permission: string): string {
    switch (permission) {
      case 'read': return '#2196F3';
      case 'create': return '#4CAF50';
      case 'update': return '#FF9800';
      case 'delete': return '#f44336';
      default: return '#9E9E9E';
    }
  }

  /** @deprecated Use {@link GetPermissionColor}. */
  getPermissionColor(permission: string): string {
    return this.GetPermissionColor(permission);
  }

  GetFieldTypeIcon(type: string): string {
    const lowerType = (type || '').toLowerCase();
    if (lowerType.includes('int') || lowerType.includes('decimal') || lowerType.includes('float') || lowerType.includes('numeric') || lowerType.includes('money')) {
      return 'fa-hashtag';
    }
    if (lowerType.includes('date') || lowerType.includes('time')) {
      return 'fa-calendar';
    }
    if (lowerType.includes('bit') || lowerType.includes('bool')) {
      return 'fa-toggle-on';
    }
    if (lowerType.includes('uniqueidentifier') || lowerType.includes('guid')) {
      return 'fa-fingerprint';
    }
    if (lowerType.includes('text') || lowerType.includes('varchar') || lowerType.includes('char') || lowerType.includes('nvarchar')) {
      return 'fa-font';
    }
    if (lowerType.includes('binary') || lowerType.includes('image') || lowerType.includes('varbinary')) {
      return 'fa-file-image';
    }
    return 'fa-circle';
  }

  /** @deprecated Use {@link GetFieldTypeIcon}. */
  getFieldTypeIcon(type: string): string {
    return this.GetFieldTypeIcon(type);
  }

  GetFieldTypeColor(type: string): string {
    const lowerType = (type || '').toLowerCase();
    if (lowerType.includes('int') || lowerType.includes('decimal') || lowerType.includes('float') || lowerType.includes('numeric') || lowerType.includes('money')) {
      return '#9C27B0';
    }
    if (lowerType.includes('date') || lowerType.includes('time')) {
      return '#FF5722';
    }
    if (lowerType.includes('bit') || lowerType.includes('bool')) {
      return '#009688';
    }
    if (lowerType.includes('uniqueidentifier') || lowerType.includes('guid')) {
      return '#607D8B';
    }
    if (lowerType.includes('text') || lowerType.includes('varchar') || lowerType.includes('char') || lowerType.includes('nvarchar')) {
      return '#2196F3';
    }
    return '#9E9E9E';
  }

  /** @deprecated Use {@link GetFieldTypeColor}. */
  getFieldTypeColor(type: string): string {
    return this.GetFieldTypeColor(type);
  }

  FormatFieldType(type: string): string {
    return type || 'unknown';
  }

  /** @deprecated Use {@link FormatFieldType}. */
  formatFieldType(type: string): string {
    return this.FormatFieldType(type);
  }

  GetFieldUsageTags(field: SimpleEntityFieldInfo, entity: ComponentEntityDataRequirement): string[] {
    const tags: string[] = [];
    if (field.isPrimaryKey) {
      tags.push('PK');
    }
    if (entity.displayFields?.includes(field.name)) {
      tags.push('Display');
    }
    if (entity.filterFields?.includes(field.name)) {
      tags.push('Filter');
    }
    if (entity.sortFields?.includes(field.name)) {
      tags.push('Sort');
    }
    return tags;
  }

  /** @deprecated Use {@link GetFieldUsageTags}. */
  getFieldUsageTags(field: SimpleEntityFieldInfo, entity: ComponentEntityDataRequirement): string[] {
    return this.GetFieldUsageTags(field, entity);
  }

  GetTagColor(tag: string): string {
    switch (tag) {
      case 'PK': return '#E91E63';
      case 'Display': return '#2196F3';
      case 'Filter': return '#FF9800';
      case 'Sort': return '#9C27B0';
      default: return '#9E9E9E';
    }
  }

  /** @deprecated Use {@link GetTagColor}. */
  getTagColor(tag: string): string {
    return this.GetTagColor(tag);
  }
}
