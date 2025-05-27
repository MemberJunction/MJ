import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EntityInfo } from '@memberjunction/core';

interface EntityFilter {
  schemaName: string | null;
  entityName: string;
  entityStatus: string | null;
  baseTable: string;
}

@Component({
  selector: 'mj-entity-filter-panel',
  templateUrl: './entity-filter-panel.component.html',
  styleUrls: ['./entity-filter-panel.component.scss']
})
export class EntityFilterPanelComponent implements OnInit {
  @Input() entities: EntityInfo[] = [];
  @Input() filteredEntities: EntityInfo[] = [];
  @Input() filters: EntityFilter = {
    schemaName: null,
    entityName: '',
    entityStatus: null,
    baseTable: '',
  };

  @Output() filtersChange = new EventEmitter<EntityFilter>();
  @Output() filterChange = new EventEmitter<void>();
  @Output() resetFilters = new EventEmitter<void>();
  @Output() closePanel = new EventEmitter<void>();

  public distinctSchemas: Array<{ text: string; value: string }> = [];

  ngOnInit(): void {
    this.updateDistinctSchemas();
  }

  public onFilterChange(): void {
    this.filtersChange.emit(this.filters);
    this.filterChange.emit();
  }

  public resetAllFilters(): void {
    this.resetFilters.emit();
  }

  public toggleFilterPanel(): void {
    this.closePanel.emit();
  }

  private updateDistinctSchemas(): void {
    const schemas = new Set<string>();
    this.entities.forEach(entity => {
      if (entity.SchemaName) {
        schemas.add(entity.SchemaName);
      }
    });

    this.distinctSchemas = Array.from(schemas)
      .sort()
      .map(schema => ({ text: schema, value: schema }));
  }
}