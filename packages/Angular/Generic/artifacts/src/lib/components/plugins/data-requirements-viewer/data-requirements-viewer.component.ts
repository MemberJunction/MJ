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
  @Input() dataRequirements: ComponentDataRequirements | null = null;

  // Track expanded state for entities and queries
  expandedEntities: Set<string> = new Set();
  expandedQueries: Set<string> = new Set();

  get hasData(): boolean {
    return !!this.dataRequirements;
  }

  get mode(): string {
    return this.dataRequirements?.mode || 'views';
  }

  get modeLabel(): string {
    switch (this.mode) {
      case 'views': return 'Entity Views';
      case 'queries': return 'Stored Queries';
      case 'hybrid': return 'Hybrid (Views + Queries)';
      default: return this.mode;
    }
  }

  get modeIcon(): string {
    switch (this.mode) {
      case 'views': return 'fa-table';
      case 'queries': return 'fa-database';
      case 'hybrid': return 'fa-layer-group';
      default: return 'fa-database';
    }
  }

  get entities(): ComponentEntityDataRequirement[] {
    return this.dataRequirements?.entities || [];
  }

  get queries(): ComponentQueryDataRequirement[] {
    return this.dataRequirements?.queries || [];
  }

  get description(): string {
    return this.dataRequirements?.description || '';
  }

  get totalFieldCount(): number {
    let count = 0;
    for (const entity of this.entities) {
      count += entity.fieldMetadata?.length || 0;
    }
    for (const query of this.queries) {
      count += query.fields?.length || 0;
    }
    return count;
  }

  toggleEntity(entityName: string): void {
    if (this.expandedEntities.has(entityName)) {
      this.expandedEntities.delete(entityName);
    } else {
      this.expandedEntities.add(entityName);
    }
  }

  toggleQuery(queryKey: string): void {
    if (this.expandedQueries.has(queryKey)) {
      this.expandedQueries.delete(queryKey);
    } else {
      this.expandedQueries.add(queryKey);
    }
  }

  isEntityExpanded(entityName: string): boolean {
    return this.expandedEntities.has(entityName);
  }

  isQueryExpanded(queryKey: string): boolean {
    return this.expandedQueries.has(queryKey);
  }

  getQueryKey(query: ComponentQueryDataRequirement): string {
    return `${query.categoryPath}/${query.name}`;
  }

  getPermissionIcon(permission: string): string {
    switch (permission) {
      case 'read': return 'fa-eye';
      case 'create': return 'fa-plus';
      case 'update': return 'fa-pen';
      case 'delete': return 'fa-trash';
      default: return 'fa-question';
    }
  }

  getPermissionColor(permission: string): string {
    switch (permission) {
      case 'read': return '#2196F3';
      case 'create': return '#4CAF50';
      case 'update': return '#FF9800';
      case 'delete': return '#f44336';
      default: return '#9E9E9E';
    }
  }

  getFieldTypeIcon(type: string): string {
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

  getFieldTypeColor(type: string): string {
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

  formatFieldType(type: string): string {
    return type || 'unknown';
  }

  getFieldUsageTags(field: SimpleEntityFieldInfo, entity: ComponentEntityDataRequirement): string[] {
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

  getTagColor(tag: string): string {
    switch (tag) {
      case 'PK': return '#E91E63';
      case 'Display': return '#2196F3';
      case 'Filter': return '#FF9800';
      case 'Sort': return '#9C27B0';
      default: return '#9E9E9E';
    }
  }
}
