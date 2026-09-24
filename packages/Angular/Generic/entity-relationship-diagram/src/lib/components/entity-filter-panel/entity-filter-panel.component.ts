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
  @Input() Entities: EntityInfo[] = [];

  /** @deprecated Use {@link Entities}. */
  @Input() set entities(value: EntityInfo[]) {
    this.Entities = value;
  }
  /** @deprecated Use {@link Entities}. */
  get entities(): EntityInfo[] {
    return this.Entities;
  }

  /** Currently filtered entities (for display count) */
  @Input() FilteredEntities: EntityInfo[] = [];

  /** @deprecated Use {@link FilteredEntities}. */
  @Input() set filteredEntities(value: EntityInfo[]) {
    this.FilteredEntities = value;
  }
  /** @deprecated Use {@link FilteredEntities}. */
  get filteredEntities(): EntityInfo[] {
    return this.FilteredEntities;
  }

  /** Current filter values */
  @Input() Filters: EntityFilter = {
    schemaName: null,
    entityName: '',
    entityStatus: null,
    baseTable: '',
  };

  /** @deprecated Use {@link Filters}. */
  @Input() set filters(value: EntityFilter) {
    this.Filters = value;
  }
  /** @deprecated Use {@link Filters}. */
  get filters(): EntityFilter {
    return this.Filters;
  }

  /** Emitted when any filter value changes */
  @Output() FiltersChange = new EventEmitter<EntityFilter>();

  /**
   * @deprecated Use {@link FiltersChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (filtersChange) keeps working. Must stay AFTER FiltersChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() filtersChange = this.FiltersChange;

  /** Emitted when filter is applied (for debouncing) */
  @Output() FilterChange = new EventEmitter<void>();

  /**
   * @deprecated Use {@link FilterChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (filterChange) keeps working. Must stay AFTER FilterChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() filterChange = this.FilterChange;

  /** Emitted when reset button is clicked */
  @Output() ResetFilters = new EventEmitter<void>();

  /**
   * @deprecated Use {@link ResetFilters}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (resetFilters) keeps working. Must stay AFTER ResetFilters: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() resetFilters = this.ResetFilters;

  /** Emitted when close button is clicked */
  @Output() ClosePanel = new EventEmitter<void>();

  /**
   * @deprecated Use {@link ClosePanel}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (closePanel) keeps working. Must stay AFTER ClosePanel: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() closePanel = this.ClosePanel;

  public SchemaOptions: FilterOption[] = [];

  /** @deprecated Use {@link SchemaOptions}. */
  public get schemaOptions(): FilterOption[] {
    return this.SchemaOptions;
  }
  /** @deprecated Use {@link SchemaOptions}. */
  public set schemaOptions(value: FilterOption[]) {
    this.SchemaOptions = value;
  }
  public readonly StatusOptions = STATUS_OPTIONS;

  /** @deprecated Use {@link StatusOptions}. */
  public get statusOptions() {
    return this.StatusOptions;
  }

  ngOnInit(): void {
    this.updateDistinctSchemas();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entities']) {
      this.updateDistinctSchemas();
    }
  }

  public OnSchemaChange(value: unknown): void {
    this.Filters = { ...this.Filters, schemaName: (value as string | null) ?? null };
    this.emitFilterChange();
  }

  /** @deprecated Use {@link OnSchemaChange}. */
  public onSchemaChange(value: unknown): void {
    return this.OnSchemaChange(value);
  }

  public OnStatusChange(value: unknown): void {
    this.Filters = { ...this.Filters, entityStatus: (value as string | null) ?? null };
    this.emitFilterChange();
  }

  /** @deprecated Use {@link OnStatusChange}. */
  public onStatusChange(value: unknown): void {
    return this.OnStatusChange(value);
  }

  public onFilterChange(): void {
    this.emitFilterChange();
  }

  public ResetAllFilters(): void {
    this.ResetFilters.emit();
  }

  /** @deprecated Use {@link ResetAllFilters}. */
  public resetAllFilters(): void {
    return this.ResetAllFilters();
  }

  public ToggleFilterPanel(): void {
    this.ClosePanel.emit();
  }

  /** @deprecated Use {@link ToggleFilterPanel}. */
  public toggleFilterPanel(): void {
    return this.ToggleFilterPanel();
  }

  private emitFilterChange(): void {
    this.FiltersChange.emit(this.Filters);
    this.FilterChange.emit();
  }

  private updateDistinctSchemas(): void {
    const schemas = new Set<string>();
    this.Entities.forEach(entity => {
      if (entity.SchemaName) {
        schemas.add(entity.SchemaName);
      }
    });

    this.SchemaOptions = [
      { text: 'All Schemas', value: null },
      ...Array.from(schemas).sort().map(schema => ({ text: schema, value: schema })),
    ];
  }
}
