import { Component, Input, Output, EventEmitter, OnInit, ViewEncapsulation } from '@angular/core';
import {
  CompositeFilterDescriptor,
  FilterDescriptor,
  FilterFieldInfo,
  FilterLogic,
  FilterSource,
  IsCompositeFilter,
  CreateFilterRule
} from '../types/filter.types';

/**
 * FilterGroupComponent - A group of filter rules with AND/OR logic
 *
 * Supports nested groups for complex filter expressions.
 */
@Component({
  standalone: false,
  selector: 'mj-filter-group',
  templateUrl: './filter-group.component.html',
  styleUrls: ['./filter-group.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class FilterGroupComponent implements OnInit {
  /**
   * The composite filter descriptor for this group
   */
  @Input() Filter!: CompositeFilterDescriptor;

  /** @deprecated Use {@link Filter}. */
  @Input() set filter(value: CompositeFilterDescriptor) {
    this.Filter = value;
  }
  /** @deprecated Use {@link Filter}. */
  get filter(): CompositeFilterDescriptor {
    return this.Filter;
  }

  /**
   * Available fields to filter on
   */
  @Input() fields: FilterFieldInfo[] = [];

  /** Multi-entity sources. Empty = legacy single-entity field list. */
  @Input() Sources: FilterSource[] = [];

  /** @deprecated Use {@link Sources}. */
  @Input() set sources(value: FilterSource[]) {
    this.Sources = value;
  }
  /** @deprecated Use {@link Sources}. */
  get sources(): FilterSource[] {
    return this.Sources;
  }

  /**
   * Whether this is the root group (affects delete button visibility)
   */
  @Input() IsRoot: boolean = false;

  /** @deprecated Use {@link IsRoot}. */
  @Input() set isRoot(value: boolean) {
    this.IsRoot = value;
  }
  /** @deprecated Use {@link IsRoot}. */
  get isRoot(): boolean {
    return this.IsRoot;
  }

  /**
   * Nesting depth (for visual indication)
   */
  @Input() Depth: number = 0;

  /** @deprecated Use {@link Depth}. */
  @Input() set depth(value: number) {
    this.Depth = value;
  }
  /** @deprecated Use {@link Depth}. */
  get depth(): number {
    return this.Depth;
  }

  /**
   * Maximum nesting depth allowed
   */
  @Input() MaxDepth: number = 3;

  /** @deprecated Use {@link MaxDepth}. */
  @Input() set maxDepth(value: number) {
    this.MaxDepth = value;
  }
  /** @deprecated Use {@link MaxDepth}. */
  get maxDepth(): number {
    return this.MaxDepth;
  }

  /**
   * Whether the component is disabled
   */
  @Input() Disabled: boolean = false;

  /** @deprecated Use {@link Disabled}. */
  @Input() set disabled(value: boolean) {
    this.Disabled = value;
  }
  /** @deprecated Use {@link Disabled}. */
  get disabled(): boolean {
    return this.Disabled;
  }

  /**
   * Emitted when the filter changes
   */
  @Output() FilterChange = new EventEmitter<CompositeFilterDescriptor>();

  /**
   * @deprecated Use {@link FilterChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (filterChange) keeps working. Must stay AFTER FilterChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() filterChange = this.FilterChange;

  /**
   * Emitted when the delete button is clicked (for nested groups)
   */
  @Output() Delete = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Delete}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (delete) keeps working. Must stay AFTER Delete: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() delete = this.Delete;

  ngOnInit(): void {
    // Ensure filter has at least one rule
    if (!this.Filter.filters || this.Filter.filters.length === 0) {
      this.AddRule();
    }
  }

  /**
   * Toggle the logic between AND and OR
   */
  ToggleLogic(): void {
    const newLogic: FilterLogic = this.Filter.logic === 'and' ? 'or' : 'and';
    this.emitChange({
      ...this.Filter,
      logic: newLogic
    });
  }

  /** @deprecated Use {@link ToggleLogic}. */
  toggleLogic(): void {
    return this.ToggleLogic();
  }

  /**
   * Set specific logic
   */
  SetLogic(logic: FilterLogic): void {
    if (this.Filter.logic !== logic) {
      this.emitChange({
        ...this.Filter,
        logic
      });
    }
  }

  /** @deprecated Use {@link SetLogic}. */
  setLogic(logic: FilterLogic): void {
    return this.SetLogic(logic);
  }

  /**
   * Add a new filter rule
   */
  AddRule(): void {
    const defaultField = this.fields[0]?.name || '';
    const newRule = CreateFilterRule(defaultField);

    this.emitChange({
      ...this.Filter,
      filters: [...(this.Filter.filters || []), newRule]
    });
  }

  /** @deprecated Use {@link AddRule}. */
  addRule(): void {
    return this.AddRule();
  }

  /**
   * Add a new nested group
   */
  AddGroup(): void {
    if (this.Depth >= this.MaxDepth) return;

    const defaultField = this.fields[0]?.name || '';
    const newGroup: CompositeFilterDescriptor = {
      logic: 'and',
      filters: [CreateFilterRule(defaultField)]
    };

    this.emitChange({
      ...this.Filter,
      filters: [...(this.Filter.filters || []), newGroup]
    });
  }

  /** @deprecated Use {@link AddGroup}. */
  addGroup(): void {
    return this.AddGroup();
  }

  /**
   * Handle rule change at specified index
   */
  OnRuleChange(index: number, updatedRule: FilterDescriptor): void {
    const filters = [...(this.Filter.filters || [])];
    filters[index] = updatedRule;
    this.emitChange({
      ...this.Filter,
      filters
    });
  }

  /** @deprecated Use {@link OnRuleChange}. */
  onRuleChange(index: number, updatedRule: FilterDescriptor): void {
    return this.OnRuleChange(index, updatedRule);
  }

  /**
   * Handle nested group change at specified index
   */
  OnGroupChange(index: number, updatedGroup: CompositeFilterDescriptor): void {
    const filters = [...(this.Filter.filters || [])];
    filters[index] = updatedGroup;
    this.emitChange({
      ...this.Filter,
      filters
    });
  }

  /** @deprecated Use {@link OnGroupChange}. */
  onGroupChange(index: number, updatedGroup: CompositeFilterDescriptor): void {
    return this.OnGroupChange(index, updatedGroup);
  }

  /**
   * Delete filter at specified index
   */
  DeleteFilter(index: number): void {
    const filters = [...(this.Filter.filters || [])];
    filters.splice(index, 1);

    // Ensure at least one rule remains if this is the root
    if (this.IsRoot && filters.length === 0) {
      const defaultField = this.fields[0]?.name || '';
      filters.push(CreateFilterRule(defaultField));
    }

    this.emitChange({
      ...this.Filter,
      filters
    });
  }

  /** @deprecated Use {@link DeleteFilter}. */
  deleteFilter(index: number): void {
    return this.DeleteFilter(index);
  }

  /**
   * Delete this group (only for nested groups)
   */
  OnDelete(): void {
    this.Delete.emit();
  }

  /** @deprecated Use {@link OnDelete}. */
  onDelete(): void {
    return this.OnDelete();
  }

  /**
   * Check if a filter is a composite (group) filter
   */
  IsGroup(filter: FilterDescriptor | CompositeFilterDescriptor): boolean {
    return IsCompositeFilter(filter);
  }

  /** @deprecated Use {@link IsGroup}. */
  isGroup(filter: FilterDescriptor | CompositeFilterDescriptor): boolean {
    return this.IsGroup(filter);
  }

  /**
   * Type guard cast to FilterDescriptor
   */
  AsRule(filter: FilterDescriptor | CompositeFilterDescriptor): FilterDescriptor {
    return filter as FilterDescriptor;
  }

  /** @deprecated Use {@link AsRule}. */
  asRule(filter: FilterDescriptor | CompositeFilterDescriptor): FilterDescriptor {
    return this.AsRule(filter);
  }

  /**
   * Type guard cast to CompositeFilterDescriptor
   */
  AsGroup(filter: FilterDescriptor | CompositeFilterDescriptor): CompositeFilterDescriptor {
    return filter as CompositeFilterDescriptor;
  }

  /** @deprecated Use {@link AsGroup}. */
  asGroup(filter: FilterDescriptor | CompositeFilterDescriptor): CompositeFilterDescriptor {
    return this.AsGroup(filter);
  }

  /**
   * Check if we can add more nested groups
   */
  CanAddGroup(): boolean {
    return this.Depth < this.MaxDepth;
  }

  /** @deprecated Use {@link CanAddGroup}. */
  canAddGroup(): boolean {
    return this.CanAddGroup();
  }

  /**
   * Emit the filter change event
   */
  private emitChange(filter: CompositeFilterDescriptor): void {
    this.FilterChange.emit(filter);
  }

  /**
   * Track by function for ngFor optimization
   */
  TrackByIndex(index: number): number {
    return index;
  }

  /** @deprecated Use {@link TrackByIndex}. */
  trackByIndex(index: number): number {
    return this.TrackByIndex(index);
  }
}
