import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import {
  FilterDescriptor,
  FilterFieldInfo,
  FilterFieldType,
  FilterOperator
} from '../types/filter.types';
import { getOperatorsForType, OperatorInfo, operatorRequiresValue } from '../types/operators';

/**
 * FilterRuleComponent - A single filter condition row
 *
 * Displays field selector, operator selector, and value editor
 * based on the field type.
 */
@Component({
  selector: 'mj-filter-rule',
  templateUrl: './filter-rule.component.html',
  styleUrls: ['./filter-rule.component.css']
})
export class FilterRuleComponent implements OnInit, OnChanges {
  /**
   * The filter descriptor for this rule
   */
  @Input() filter!: FilterDescriptor;

  /**
   * Available fields to filter on
   */
  @Input() fields: FilterFieldInfo[] = [];

  /**
   * Whether the component is disabled
   */
  @Input() disabled: boolean = false;

  /**
   * Whether to show the delete button
   */
  @Input() showDelete: boolean = true;

  /**
   * Emitted when the filter changes
   */
  @Output() filterChange = new EventEmitter<FilterDescriptor>();

  /**
   * Emitted when the delete button is clicked
   */
  @Output() delete = new EventEmitter<void>();

  /**
   * Currently selected field info
   */
  public selectedField: FilterFieldInfo | null = null;

  /**
   * Available operators for the selected field type
   */
  public availableOperators: OperatorInfo[] = [];

  /**
   * Whether the current operator requires a value
   */
  public requiresValue: boolean = true;

  ngOnInit(): void {
    this.updateFieldSelection();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filter'] || changes['fields']) {
      this.updateFieldSelection();
    }
  }

  /**
   * Update the selected field and available operators
   */
  private updateFieldSelection(): void {
    if (!this.filter || !this.fields.length) return;

    this.selectedField = this.fields.find(f => f.name === this.filter.field) || null;

    if (this.selectedField) {
      this.availableOperators = getOperatorsForType(this.selectedField.type);
      this.requiresValue = operatorRequiresValue(this.filter.operator);
    } else {
      this.availableOperators = [];
      this.requiresValue = true;
    }
  }

  /**
   * Handle field selection change
   */
  onFieldChange(fieldName: string): void {
    const field = this.fields.find(f => f.name === fieldName);
    if (!field) return;

    this.selectedField = field;
    this.availableOperators = getOperatorsForType(field.type);

    // Get default operator for the new field type
    const defaultOperator = this.availableOperators[0]?.value || 'eq';
    this.requiresValue = operatorRequiresValue(defaultOperator);

    // Emit updated filter with new field and reset value
    this.emitChange({
      field: fieldName,
      operator: defaultOperator,
      value: this.getDefaultValue(field.type)
    });
  }

  /**
   * Handle operator selection change
   */
  onOperatorChange(operator: FilterOperator): void {
    this.requiresValue = operatorRequiresValue(operator);

    // If operator doesn't require value, clear it
    const value = this.requiresValue ? this.filter.value : null;

    this.emitChange({
      ...this.filter,
      operator,
      value
    });
  }

  /**
   * Handle value change
   */
  onValueChange(value: unknown): void {
    this.emitChange({
      ...this.filter,
      value
    });
  }

  /**
   * Handle boolean toggle
   */
  onBooleanChange(value: boolean): void {
    this.emitChange({
      ...this.filter,
      value
    });
  }

  /**
   * Handle date change
   */
  onDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value ? new Date(input.value).toISOString() : null;
    this.emitChange({
      ...this.filter,
      value
    });
  }

  /**
   * Handle delete button click
   */
  onDelete(): void {
    this.delete.emit();
  }

  /**
   * Emit the filter change event
   */
  private emitChange(filter: FilterDescriptor): void {
    this.filterChange.emit(filter);
  }

  /**
   * Get default value for a field type
   */
  private getDefaultValue(type: FilterFieldType): unknown {
    switch (type) {
      case 'string':
        return '';
      case 'number':
        return null;
      case 'boolean':
        return true;
      case 'date':
        return null;
      case 'lookup':
        return null;
      default:
        return null;
    }
  }

  /**
   * Get the date value formatted for the date input
   */
  getDateInputValue(): string {
    if (!this.filter.value) return '';
    try {
      const date = new Date(this.filter.value as string);
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  }

  /**
   * Check if the current field has a value list (dropdown options)
   */
  hasValueList(): boolean {
    return !!(this.selectedField?.valueList && this.selectedField.valueList.length > 0);
  }
}
