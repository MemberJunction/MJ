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

interface FilterOption {
  text: string;
  value: string | null;
}

/** Dropdown items for the Status filter — static list. */
const STATUS_OPTIONS: ReadonlyArray<FilterOption> = [
  { text: 'All Statuses', value: null },
  { text: 'Active', value: 'Active' },
  { text: 'Deprecated', value: 'Deprecated' },
  { text: 'Disabled', value: 'Disabled' },
];

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

  public schemaOptions: FilterOption[] = [];
  public readonly statusOptions = STATUS_OPTIONS;

  ngOnInit(): void {
    this.updateDistinctSchemas();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entities']) {
      this.updateDistinctSchemas();
    }
  }

  public onSchemaChange(value: unknown): void {
    this.filters = { ...this.filters, schemaName: (value as string | null) ?? null };
    this.emitFilterChange();
  }

  public onStatusChange(value: unknown): void {
    this.filters = { ...this.filters, entityStatus: (value as string | null) ?? null };
    this.emitFilterChange();
  }

  public onFilterChange(): void {
    this.emitFilterChange();
  }

  public resetAllFilters(): void {
    this.resetFilters.emit();
  }

  public toggleFilterPanel(): void {
    this.closePanel.emit();
  }

  private emitFilterChange(): void {
    this.filtersChange.emit(this.filters);
    this.filterChange.emit();
  }

  private updateDistinctSchemas(): void {
    const schemas = new Set<string>();
    this.entities.forEach(entity => {
      if (entity.SchemaName) {
        schemas.add(entity.SchemaName);
      }
    });

    this.schemaOptions = [
      { text: 'All Schemas', value: null },
      ...Array.from(schemas).sort().map(schema => ({ text: schema, value: schema })),
    ];
  }
}
