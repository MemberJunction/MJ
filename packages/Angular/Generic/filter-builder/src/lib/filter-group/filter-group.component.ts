import { Component, Input, Output, EventEmitter, OnInit, ViewEncapsulation } from '@angular/core';
import {
  CompositeFilterDescriptor,
  FilterDescriptor,
  FilterFieldInfo,
  FilterLogic,
  isCompositeFilter,
  createFilterRule
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
  @Input() filter!: CompositeFilterDescriptor;

  /**
   * Available fields to filter on
   */
  @Input() fields: FilterFieldInfo[] = [];

  /**
   * Whether this is the root group (affects delete button visibility)
   */
  @Input() isRoot: boolean = false;

  /**
   * Nesting depth (for visual indication)
   */
  @Input() depth: number = 0;

  /**
   * Maximum nesting depth allowed
   */
  @Input() maxDepth: number = 3;

  /**
   * Whether the component is disabled
   */
  @Input() disabled: boolean = false;

  /**
   * Emitted when the filter changes
   */
  @Output() filterChange = new EventEmitter<CompositeFilterDescriptor>();

  /**
   * Emitted when the delete button is clicked (for nested groups)
   */
  @Output() delete = new EventEmitter<void>();

  ngOnInit(): void {
    // Ensure filter has at least one rule
    if (!this.filter.filters || this.filter.filters.length === 0) {
      this.addRule();
    }
  }

  /**
   * Toggle the logic between AND and OR
   */
  toggleLogic(): void {
    const newLogic: FilterLogic = this.filter.logic === 'and' ? 'or' : 'and';
    this.emitChange({
      ...this.filter,
      logic: newLogic
    });
  }

  /**
   * Set specific logic
   */
  setLogic(logic: FilterLogic): void {
    if (this.filter.logic !== logic) {
      this.emitChange({
        ...this.filter,
        logic
      });
    }
  }

  /**
   * Add a new filter rule
   */
  addRule(): void {
    const defaultField = this.fields[0]?.name || '';
    const newRule = createFilterRule(defaultField);

    this.emitChange({
      ...this.filter,
      filters: [...(this.filter.filters || []), newRule]
    });
  }

  /**
   * Add a new nested group
   */
  addGroup(): void {
    if (this.depth >= this.maxDepth) return;

    const defaultField = this.fields[0]?.name || '';
    const newGroup: CompositeFilterDescriptor = {
      logic: 'and',
      filters: [createFilterRule(defaultField)]
    };

    this.emitChange({
      ...this.filter,
      filters: [...(this.filter.filters || []), newGroup]
    });
  }

  /**
   * Handle rule change at specified index
   */
  onRuleChange(index: number, updatedRule: FilterDescriptor): void {
    const filters = [...(this.filter.filters || [])];
    filters[index] = updatedRule;
    this.emitChange({
      ...this.filter,
      filters
    });
  }

  /**
   * Handle nested group change at specified index
   */
  onGroupChange(index: number, updatedGroup: CompositeFilterDescriptor): void {
    const filters = [...(this.filter.filters || [])];
    filters[index] = updatedGroup;
    this.emitChange({
      ...this.filter,
      filters
    });
  }

  /**
   * Delete filter at specified index
   */
  deleteFilter(index: number): void {
    const filters = [...(this.filter.filters || [])];
    filters.splice(index, 1);

    // Ensure at least one rule remains if this is the root
    if (this.isRoot && filters.length === 0) {
      const defaultField = this.fields[0]?.name || '';
      filters.push(createFilterRule(defaultField));
    }

    this.emitChange({
      ...this.filter,
      filters
    });
  }

  /**
   * Delete this group (only for nested groups)
   */
  onDelete(): void {
    this.delete.emit();
  }

  /**
   * Check if a filter is a composite (group) filter
   */
  isGroup(filter: FilterDescriptor | CompositeFilterDescriptor): boolean {
    return isCompositeFilter(filter);
  }

  /**
   * Type guard cast to FilterDescriptor
   */
  asRule(filter: FilterDescriptor | CompositeFilterDescriptor): FilterDescriptor {
    return filter as FilterDescriptor;
  }

  /**
   * Type guard cast to CompositeFilterDescriptor
   */
  asGroup(filter: FilterDescriptor | CompositeFilterDescriptor): CompositeFilterDescriptor {
    return filter as CompositeFilterDescriptor;
  }

  /**
   * Check if we can add more nested groups
   */
  canAddGroup(): boolean {
    return this.depth < this.maxDepth;
  }

  /**
   * Emit the filter change event
   */
  private emitChange(filter: CompositeFilterDescriptor): void {
    this.filterChange.emit(filter);
  }

  /**
   * Track by function for ngFor optimization
   */
  trackByIndex(index: number): number {
    return index;
  }
}
