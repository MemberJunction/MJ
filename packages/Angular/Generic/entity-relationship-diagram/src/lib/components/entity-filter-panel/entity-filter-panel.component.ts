import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';

/**
 * Filter configuration for entity filtering.
 */
export interface EntityFilter {
  schemaName: string | null;
  entityName: string;
  entityStatus: string | null;
  baseTable: string;
}

/**
 * Entity filter panel component that provides filtering controls for entities.
 * Supports filtering by schema, entity name, base table, and status.
 *
 * This component is designed to be used alongside the ERD diagram to filter
 * which entities are displayed.
 */
@Component({
  standalone: false,
  selector: 'mj-entity-filter-panel',
  templateUrl: './entity-filter-panel.component.html',
  styleUrls: ['./entity-filter-panel.component.css']
})
export class EntityFilterPanelComponent implements OnInit, OnChanges {
  /** All entities available for filtering */
  @Input() entities: EntityInfo[] = [];

  /** Currently filtered entities (for display count) */
  @Input() filteredEntities: EntityInfo[] = [];

  /** Current filter values */
  @Input() filters: EntityFilter = {
    schemaName: null,
    entityName: '',
    entityStatus: null,
    baseTable: '',
  };

  /** Emitted when any filter value changes */
  @Output() filtersChange = new EventEmitter<EntityFilter>();

  /** Emitted when filter is applied (for debouncing) */
  @Output() filterChange = new EventEmitter<void>();

  /** Emitted when reset button is clicked */
  @Output() resetFilters = new EventEmitter<void>();

  /** Emitted when close button is clicked */
  @Output() closePanel = new EventEmitter<void>();

  public distinctSchemas: Array<{ text: string; value: string }> = [];

  ngOnInit(): void {
    this.updateDistinctSchemas();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entities']) {
      this.updateDistinctSchemas();
    }
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
