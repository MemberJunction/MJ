import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ViewEncapsulation, HostListener, ElementRef, ViewChild } from '@angular/core';
import {
  FilterDescriptor,
  FilterFieldInfo,
  FilterFieldType,
  FilterOperator,
  FilterSource
} from '../types/filter.types';
import { CompositeFilter } from '@memberjunction/core';
import { GetOperatorsForType, OperatorInfo, OperatorRequiresValue } from '../types/operators';

/**
 * FilterRuleComponent - A single filter condition row
 *
 * Displays field selector, operator selector, and value editor
 * based on the field type.
 */
@Component({
  standalone: false,
  selector: 'mj-filter-rule',
  templateUrl: './filter-rule.component.html',
  styleUrls: ['./filter-rule.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class FilterRuleComponent implements OnInit, OnChanges {
  /**
   * The filter descriptor for this rule
   */
  @Input() Filter!: FilterDescriptor;

  /** @deprecated Use {@link Filter}. */
  @Input() set filter(value: FilterDescriptor) {
    this.Filter = value;
  }
  /** @deprecated Use {@link Filter}. */
  get filter(): FilterDescriptor {
    return this.Filter;
  }

  /**
   * Available fields to filter on
   */
  @Input() fields: FilterFieldInfo[] = [];

  @Input() Sources: FilterSource[] = [];

  /** @deprecated Use {@link Sources}. */
  @Input() set sources(value: FilterSource[]) {
    this.Sources = value;
  }
  /** @deprecated Use {@link Sources}. */
  get sources(): FilterSource[] {
    return this.Sources;
  }

  public ActiveSourceKey: string | null = null;

  /** @deprecated Use {@link ActiveSourceKey}. */
  public get activeSourceKey(): string | null {
    return this.ActiveSourceKey;
  }
  /** @deprecated Use {@link ActiveSourceKey}. */
  public set activeSourceKey(value: string | null) {
    this.ActiveSourceKey = value;
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
   * Whether to show the delete button
   */
  @Input() ShowDelete: boolean = true;

  /** @deprecated Use {@link ShowDelete}. */
  @Input() set showDelete(value: boolean) {
    this.ShowDelete = value;
  }
  /** @deprecated Use {@link ShowDelete}. */
  get showDelete(): boolean {
    return this.ShowDelete;
  }

  /**
   * Emitted when the filter changes
   */
  @Output() FilterChange = new EventEmitter<FilterDescriptor>();

  /**
   * @deprecated Use {@link FilterChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (filterChange) keeps working. Must stay AFTER FilterChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() filterChange = this.FilterChange;

  /**
   * Emitted when the delete button is clicked
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

  /**
   * Currently selected field info
   */
  public SelectedField: FilterFieldInfo | null = null;

  /** @deprecated Use {@link SelectedField}. */
  public get selectedField(): FilterFieldInfo | null {
    return this.SelectedField;
  }
  /** @deprecated Use {@link SelectedField}. */
  public set selectedField(value: FilterFieldInfo | null) {
    this.SelectedField = value;
  }

  /**
   * Available operators for the selected field type
   */
  public AvailableOperators: OperatorInfo[] = [];

  /** @deprecated Use {@link AvailableOperators}. */
  public get availableOperators(): OperatorInfo[] {
    return this.AvailableOperators;
  }
  /** @deprecated Use {@link AvailableOperators}. */
  public set availableOperators(value: OperatorInfo[]) {
    this.AvailableOperators = value;
  }

  /**
   * Whether the current operator requires a value
   */
  public RequiresValue: boolean = true;

  /** @deprecated Use {@link RequiresValue}. */
  public get requiresValue(): boolean {
    return this.RequiresValue;
  }
  /** @deprecated Use {@link RequiresValue}. */
  public set requiresValue(value: boolean) {
    this.RequiresValue = value;
  }

  // Dropdown state

  // Fixed-position style for the active dropdown (escapes overflow clipping)
  public DropdownMenuStyle: Record<string, string> = {};

  /** @deprecated Use {@link DropdownMenuStyle}. */
  public get dropdownMenuStyle(): Record<string, string> {
    return this.DropdownMenuStyle;
  }
  /** @deprecated Use {@link DropdownMenuStyle}. */
  public set dropdownMenuStyle(value: Record<string, string>) {
    this.DropdownMenuStyle = value;
  }

  public FieldDropdownOpen = false;

  /** @deprecated Use {@link FieldDropdownOpen}. */
  public get fieldDropdownOpen() {
    return this.FieldDropdownOpen;
  }
  /** @deprecated Use {@link FieldDropdownOpen}. */
  public set fieldDropdownOpen(value) {
    this.FieldDropdownOpen = value;
  }
  public OperatorDropdownOpen = false;

  /** @deprecated Use {@link OperatorDropdownOpen}. */
  public get operatorDropdownOpen() {
    return this.OperatorDropdownOpen;
  }
  /** @deprecated Use {@link OperatorDropdownOpen}. */
  public set operatorDropdownOpen(value) {
    this.OperatorDropdownOpen = value;
  }
  public ValueDropdownOpen = false;

  /** @deprecated Use {@link ValueDropdownOpen}. */
  public get valueDropdownOpen() {
    return this.ValueDropdownOpen;
  }
  /** @deprecated Use {@link ValueDropdownOpen}. */
  public set valueDropdownOpen(value) {
    this.ValueDropdownOpen = value;
  }

  // Keyboard navigation state
  public FieldHighlightIndex = -1;

  /** @deprecated Use {@link FieldHighlightIndex}. */
  public get fieldHighlightIndex() {
    return this.FieldHighlightIndex;
  }
  /** @deprecated Use {@link FieldHighlightIndex}. */
  public set fieldHighlightIndex(value) {
    this.FieldHighlightIndex = value;
  }
  public OperatorHighlightIndex = -1;

  /** @deprecated Use {@link OperatorHighlightIndex}. */
  public get operatorHighlightIndex() {
    return this.OperatorHighlightIndex;
  }
  /** @deprecated Use {@link OperatorHighlightIndex}. */
  public set operatorHighlightIndex(value) {
    this.OperatorHighlightIndex = value;
  }
  public ValueHighlightIndex = -1;

  /** @deprecated Use {@link ValueHighlightIndex}. */
  public get valueHighlightIndex() {
    return this.ValueHighlightIndex;
  }
  /** @deprecated Use {@link ValueHighlightIndex}. */
  public set valueHighlightIndex(value) {
    this.ValueHighlightIndex = value;
  }

  // ViewChild references for dropdown buttons (Safari focus fix)
  @ViewChild('fieldDropdownBtn') FieldDropdownBtn!: ElementRef<HTMLButtonElement>;

  /** @deprecated Use {@link FieldDropdownBtn}. */
  get fieldDropdownBtn(): ElementRef<HTMLButtonElement> {
    return this.FieldDropdownBtn;
  }
  /** @deprecated Use {@link FieldDropdownBtn}. */
  set fieldDropdownBtn(value: ElementRef<HTMLButtonElement>) {
    this.FieldDropdownBtn = value;
  }
  @ViewChild('operatorDropdownBtn') OperatorDropdownBtn!: ElementRef<HTMLButtonElement>;

  /** @deprecated Use {@link OperatorDropdownBtn}. */
  get operatorDropdownBtn(): ElementRef<HTMLButtonElement> {
    return this.OperatorDropdownBtn;
  }
  /** @deprecated Use {@link OperatorDropdownBtn}. */
  set operatorDropdownBtn(value: ElementRef<HTMLButtonElement>) {
    this.OperatorDropdownBtn = value;
  }
  @ViewChild('valueDropdownBtn') ValueDropdownBtn!: ElementRef<HTMLButtonElement>;

  /** @deprecated Use {@link ValueDropdownBtn}. */
  get valueDropdownBtn(): ElementRef<HTMLButtonElement> {
    return this.ValueDropdownBtn;
  }
  /** @deprecated Use {@link ValueDropdownBtn}. */
  set valueDropdownBtn(value: ElementRef<HTMLButtonElement>) {
    this.ValueDropdownBtn = value;
  }

  constructor(private elementRef: ElementRef) {}

  /**
   * Close dropdowns when clicking outside the component
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.CloseAllDropdowns();
    }
  }

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
    if (!this.Filter || !this.fields.length) return;

    this.SelectedField =
      this.fields.find((f) => f.name === this.Filter.field) ||
      this.fields.find((f) => CompositeFilter.ParseFilterField(f.name).Name === this.Filter.field) ||
      null;
    this.ActiveSourceKey = CompositeFilter.ParseFilterField(this.Filter.field).Source || this.Sources[0]?.key || null;

    if (this.SelectedField) {
      this.AvailableOperators = GetOperatorsForType(this.SelectedField.type);
      this.RequiresValue = OperatorRequiresValue(this.Filter.operator);
    } else {
      this.AvailableOperators = [];
      this.RequiresValue = true;
    }
  }

  // ========================================
  // DROPDOWN POSITIONING
  // ========================================

  /**
   * Calculate fixed-position style for a dropdown menu based on its trigger button.
   * Uses position:fixed so the menu escapes any overflow:hidden/auto ancestors.
   * Accounts for CSS transform on ancestors (which change the containing block for fixed positioning).
   */
  private calculateDropdownPosition(triggerBtn: ElementRef<HTMLButtonElement> | undefined): void {
    if (!triggerBtn?.nativeElement) {
      this.DropdownMenuStyle = {};
      return;
    }
    const rect = triggerBtn.nativeElement.getBoundingClientRect();
    const offset = this.getTransformAncestorOffset(triggerBtn.nativeElement);
    this.DropdownMenuStyle = {
      position: 'fixed',
      top: `${rect.bottom + 4 - offset.top}px`,
      left: `${rect.left - offset.left}px`,
      width: `${rect.width}px`
    };
  }

  /**
   * Find the nearest ancestor with a CSS transform, which creates a new
   * containing block for position:fixed elements per CSS spec.
   */
  private getTransformAncestorOffset(element: HTMLElement): { top: number; left: number } {
    let el: HTMLElement | null = element.parentElement;
    while (el) {
      const transform = getComputedStyle(el).transform;
      if (transform && transform !== 'none') {
        const ancestorRect = el.getBoundingClientRect();
        return { top: ancestorRect.top, left: ancestorRect.left };
      }
      el = el.parentElement;
    }
    return { top: 0, left: 0 };
  }

  // ========================================
  // DROPDOWN TOGGLE METHODS
  // ========================================

  ToggleFieldDropdown(): void {
    if (this.Disabled) return;
    const wasOpen = this.FieldDropdownOpen;
    this.CloseAllDropdowns();
    this.FieldDropdownOpen = !wasOpen;
    if (this.FieldDropdownOpen) {
      this.calculateDropdownPosition(this.FieldDropdownBtn);
      setTimeout(() => this.FieldDropdownBtn?.nativeElement?.focus(), 0);
    }
  }

  /** @deprecated Use {@link ToggleFieldDropdown}. */
  toggleFieldDropdown(): void {
    return this.ToggleFieldDropdown();
  }

  ToggleOperatorDropdown(): void {
    if (this.Disabled || !this.SelectedField) return;
    const wasOpen = this.OperatorDropdownOpen;
    this.CloseAllDropdowns();
    this.OperatorDropdownOpen = !wasOpen;
    if (this.OperatorDropdownOpen) {
      this.calculateDropdownPosition(this.OperatorDropdownBtn);
      setTimeout(() => this.OperatorDropdownBtn?.nativeElement?.focus(), 0);
    }
  }

  /** @deprecated Use {@link ToggleOperatorDropdown}. */
  toggleOperatorDropdown(): void {
    return this.ToggleOperatorDropdown();
  }

  ToggleValueDropdown(): void {
    if (this.Disabled) return;
    const wasOpen = this.ValueDropdownOpen;
    this.CloseAllDropdowns();
    this.ValueDropdownOpen = !wasOpen;
    if (this.ValueDropdownOpen) {
      this.calculateDropdownPosition(this.ValueDropdownBtn);
      setTimeout(() => this.ValueDropdownBtn?.nativeElement?.focus(), 0);
    }
  }

  /** @deprecated Use {@link ToggleValueDropdown}. */
  toggleValueDropdown(): void {
    return this.ToggleValueDropdown();
  }

  CloseFieldDropdown(): void {
    this.FieldDropdownOpen = false;
  }

  /** @deprecated Use {@link CloseFieldDropdown}. */
  closeFieldDropdown(): void {
    return this.CloseFieldDropdown();
  }

  CloseOperatorDropdown(): void {
    this.OperatorDropdownOpen = false;
  }

  /** @deprecated Use {@link CloseOperatorDropdown}. */
  closeOperatorDropdown(): void {
    return this.CloseOperatorDropdown();
  }

  CloseValueDropdown(): void {
    this.ValueDropdownOpen = false;
  }

  /** @deprecated Use {@link CloseValueDropdown}. */
  closeValueDropdown(): void {
    return this.CloseValueDropdown();
  }

  CloseAllDropdowns(): void {
    this.FieldDropdownOpen = false;
    this.OperatorDropdownOpen = false;
    this.ValueDropdownOpen = false;
    this.ResetHighlightIndices();
  }

  /** @deprecated Use {@link CloseAllDropdowns}. */
  closeAllDropdowns(): void {
    return this.CloseAllDropdowns();
  }

  ResetHighlightIndices(): void {
    this.FieldHighlightIndex = -1;
    this.OperatorHighlightIndex = -1;
    this.ValueHighlightIndex = -1;
  }

  /** @deprecated Use {@link ResetHighlightIndices}. */
  resetHighlightIndices(): void {
    return this.ResetHighlightIndices();
  }

  // ========================================
  // KEYBOARD NAVIGATION
  // ========================================

  /**
   * Handle keyboard events on the field dropdown trigger
   */
  OnFieldKeydown(event: KeyboardEvent): void {
    if (this.Disabled) return;

    if (!this.FieldDropdownOpen) {
      // Open dropdown on Enter, Space, or arrow keys
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.ToggleFieldDropdown();
        this.FieldHighlightIndex = this.fields.findIndex(f => f.name === this.Filter.field);
        if (this.FieldHighlightIndex < 0) this.FieldHighlightIndex = 0;
      }
      return;
    }

    this.handleDropdownKeydown(
      event,
      this.fields,
      this.FieldHighlightIndex,
      (index) => this.FieldHighlightIndex = index,
      (item) => this.SelectField(item.name),
      (item) => item.displayName,
      () => this.CloseFieldDropdown()
    );
  }

  /** @deprecated Use {@link OnFieldKeydown}. */
  onFieldKeydown(event: KeyboardEvent): void {
    return this.OnFieldKeydown(event);
  }

  /**
   * Handle keyboard events on the operator dropdown trigger
   */
  OnOperatorKeydown(event: KeyboardEvent): void {
    if (this.Disabled || !this.SelectedField) return;

    if (!this.OperatorDropdownOpen) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.ToggleOperatorDropdown();
        this.OperatorHighlightIndex = this.AvailableOperators.findIndex(o => o.value === this.Filter.operator);
        if (this.OperatorHighlightIndex < 0) this.OperatorHighlightIndex = 0;
      }
      return;
    }

    this.handleDropdownKeydown(
      event,
      this.AvailableOperators,
      this.OperatorHighlightIndex,
      (index) => this.OperatorHighlightIndex = index,
      (item) => this.SelectOperator(item.value),
      (item) => item.label,
      () => this.CloseOperatorDropdown()
    );
  }

  /** @deprecated Use {@link OnOperatorKeydown}. */
  onOperatorKeydown(event: KeyboardEvent): void {
    return this.OnOperatorKeydown(event);
  }

  /**
   * Handle keyboard events on the value dropdown trigger
   */
  OnValueKeydown(event: KeyboardEvent): void {
    if (this.Disabled || !this.SelectedField?.valueList) return;

    if (!this.ValueDropdownOpen) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.ToggleValueDropdown();
        const valueList = this.SelectedField.valueList;
        this.ValueHighlightIndex = valueList.findIndex(v => v.value === this.Filter.value);
        if (this.ValueHighlightIndex < 0) this.ValueHighlightIndex = 0;
      }
      return;
    }

    this.handleDropdownKeydown(
      event,
      this.SelectedField.valueList,
      this.ValueHighlightIndex,
      (index) => this.ValueHighlightIndex = index,
      (item) => this.SelectValueFromOption(item.value),
      (item) => item.label,
      () => this.CloseValueDropdown()
    );
  }

  /** @deprecated Use {@link OnValueKeydown}. */
  onValueKeydown(event: KeyboardEvent): void {
    return this.OnValueKeydown(event);
  }

  /**
   * Generic handler for dropdown keyboard navigation
   */
  private handleDropdownKeydown<T>(
    event: KeyboardEvent,
    items: T[],
    currentIndex: number,
    setIndex: (index: number) => void,
    onSelect: (item: T) => void,
    getLabel: (item: T) => string,
    onClose: () => void
  ): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setIndex(Math.min(currentIndex + 1, items.length - 1));
        this.scrollHighlightedItemIntoView();
        break;

      case 'ArrowUp':
        event.preventDefault();
        setIndex(Math.max(currentIndex - 1, 0));
        this.scrollHighlightedItemIntoView();
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        if (currentIndex >= 0 && currentIndex < items.length) {
          onSelect(items[currentIndex]);
        }
        break;

      case 'Escape':
      case 'Tab':
        event.preventDefault();
        onClose();
        break;

      case 'Home':
        event.preventDefault();
        setIndex(0);
        this.scrollHighlightedItemIntoView();
        break;

      case 'End':
        event.preventDefault();
        setIndex(items.length - 1);
        this.scrollHighlightedItemIntoView();
        break;

      default:
        // Type-ahead: jump to first item starting with typed character
        if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
          const char = event.key.toLowerCase();
          const startIndex = currentIndex + 1;

          // Search from current position to end, then from start
          for (let i = 0; i < items.length; i++) {
            const idx = (startIndex + i) % items.length;
            const label = getLabel(items[idx]).toLowerCase();
            if (label.startsWith(char)) {
              setIndex(idx);
              this.scrollHighlightedItemIntoView();
              break;
            }
          }
        }
        break;
    }
  }

  /**
   * Scroll the highlighted dropdown item into view
   */
  private scrollHighlightedItemIntoView(): void {
    // Use setTimeout to let Angular update the DOM first
    setTimeout(() => {
      const highlightedEl = this.elementRef.nativeElement.querySelector('.dropdown-item.highlighted');
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 0);
  }

  // ========================================
  // DISPLAY HELPERS
  // ========================================

  /**
   * Get the display name for the currently selected field
   */
  GetSelectedFieldDisplayName(): string {
    if (!this.Filter.field) return 'Select field...';
    const field =
      this.fields.find((f) => f.name === this.Filter.field) ||
      this.fields.find((f) => CompositeFilter.ParseFilterField(f.name).Name === this.Filter.field);
    const parsed = CompositeFilter.ParseFilterField(this.Filter.field);
    const fieldLabel = field?.displayName || parsed.Name;
    if (this.Sources.length > 1 && parsed.Source) {
      const src = this.Sources.find((s) => s.key === parsed.Source);
      return src ? `${src.label} · ${fieldLabel}` : fieldLabel;
    }
    return fieldLabel;
  }

  /** @deprecated Use {@link GetSelectedFieldDisplayName}. */
  getSelectedFieldDisplayName(): string {
    return this.GetSelectedFieldDisplayName();
  }

  public get IsMultiSource(): boolean {
    return this.Sources.length > 1;
  }

  /** @deprecated Use {@link IsMultiSource}. */
  public get isMultiSource(): boolean {
    return this.IsMultiSource;
  }

  public FieldsForSource(key: string | null): FilterFieldInfo[] {
    if (!key) return this.fields;
    return this.fields.filter((f) => CompositeFilter.ParseFilterField(f.name).Source === key);
  }

  /** @deprecated Use {@link FieldsForSource}. */
  public fieldsForSource(key: string | null): FilterFieldInfo[] {
    return this.FieldsForSource(key);
  }

  public SelectSource(key: string): void {
    this.ActiveSourceKey = key;
  }

  /** @deprecated Use {@link SelectSource}. */
  public selectSource(key: string): void {
    return this.SelectSource(key);
  }

  /**
   * Get the label for the currently selected operator
   */
  GetSelectedOperatorLabel(): string {
    if (!this.Filter.operator) return 'Select...';
    const op = this.AvailableOperators.find(o => o.value === this.Filter.operator);
    return op?.label || this.Filter.operator;
  }

  /** @deprecated Use {@link GetSelectedOperatorLabel}. */
  getSelectedOperatorLabel(): string {
    return this.GetSelectedOperatorLabel();
  }

  /**
   * Get the label for the currently selected value (for value list dropdowns)
   */
  GetSelectedValueLabel(): string {
    if (!this.Filter.value || !this.SelectedField?.valueList) return 'Select...';
    const option = this.SelectedField.valueList.find(o => o.value === this.Filter.value);
    return option?.label || String(this.Filter.value);
  }

  /** @deprecated Use {@link GetSelectedValueLabel}. */
  getSelectedValueLabel(): string {
    return this.GetSelectedValueLabel();
  }

  // ========================================
  // SELECTION HANDLERS
  // ========================================

  /**
   * Handle field selection from custom dropdown
   */
  SelectField(fieldName: string): void {
    this.CloseFieldDropdown();
    this.OnFieldChange(fieldName);
  }

  /** @deprecated Use {@link SelectField}. */
  selectField(fieldName: string): void {
    return this.SelectField(fieldName);
  }

  /**
   * Handle operator selection from custom dropdown
   */
  SelectOperator(operator: string): void {
    this.CloseOperatorDropdown();
    this.OnOperatorChange(operator as FilterOperator);
  }

  /** @deprecated Use {@link SelectOperator}. */
  selectOperator(operator: string): void {
    return this.SelectOperator(operator);
  }

  /**
   * Handle value selection from custom dropdown
   */
  SelectValue(value: string): void {
    this.CloseValueDropdown();
    this.OnValueChange(value);
  }

  /** @deprecated Use {@link SelectValue}. */
  selectValue(value: string): void {
    return this.SelectValue(value);
  }

  /**
   * Handle value selection from value list option (supports union type)
   */
  SelectValueFromOption(value: string | number | boolean): void {
    this.CloseValueDropdown();
    this.OnValueChange(value);
  }

  /** @deprecated Use {@link SelectValueFromOption}. */
  selectValueFromOption(value: string | number | boolean): void {
    return this.SelectValueFromOption(value);
  }

  /**
   * Handle field selection change
   */
  OnFieldChange(fieldName: string): void {
    const field = this.fields.find(f => f.name === fieldName);
    if (!field) return;

    this.SelectedField = field;
    this.AvailableOperators = GetOperatorsForType(field.type);

    // Get default operator for the new field type
    const defaultOperator = this.AvailableOperators[0]?.value || 'eq';
    this.RequiresValue = OperatorRequiresValue(defaultOperator);

    // Emit updated filter with new field and reset value
    this.emitChange({
      field: fieldName,
      operator: defaultOperator,
      value: this.getDefaultValue(field.type)
    });
  }

  /** @deprecated Use {@link OnFieldChange}. */
  onFieldChange(fieldName: string): void {
    return this.OnFieldChange(fieldName);
  }

  /**
   * Handle operator selection change
   */
  OnOperatorChange(operator: FilterOperator): void {
    this.RequiresValue = OperatorRequiresValue(operator);

    // If operator doesn't require value, clear it
    const value = this.RequiresValue ? this.Filter.value : null;

    this.emitChange({
      ...this.Filter,
      operator,
      value
    });
  }

  /** @deprecated Use {@link OnOperatorChange}. */
  onOperatorChange(operator: FilterOperator): void {
    return this.OnOperatorChange(operator);
  }

  /**
   * Handle value change
   */
  OnValueChange(value: unknown): void {
    this.emitChange({
      ...this.Filter,
      value
    });
  }

  /** @deprecated Use {@link OnValueChange}. */
  onValueChange(value: unknown): void {
    return this.OnValueChange(value);
  }

  /**
   * Handle boolean toggle
   */
  OnBooleanChange(value: boolean): void {
    this.emitChange({
      ...this.Filter,
      value
    });
  }

  /** @deprecated Use {@link OnBooleanChange}. */
  onBooleanChange(value: boolean): void {
    return this.OnBooleanChange(value);
  }

  /**
   * Handle date change
   */
  OnDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value ? new Date(input.value).toISOString() : null;
    this.emitChange({
      ...this.Filter,
      value
    });
  }

  /** @deprecated Use {@link OnDateChange}. */
  onDateChange(event: Event): void {
    return this.OnDateChange(event);
  }

  /**
   * Handle delete button click
   */
  OnDelete(): void {
    this.Delete.emit();
  }

  /** @deprecated Use {@link OnDelete}. */
  onDelete(): void {
    return this.OnDelete();
  }

  /**
   * Emit the filter change event
   */
  private emitChange(filter: FilterDescriptor): void {
    this.FilterChange.emit(filter);
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
  GetDateInputValue(): string {
    if (!this.Filter.value) return '';
    try {
      const date = new Date(this.Filter.value as string);
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  }

  /** @deprecated Use {@link GetDateInputValue}. */
  getDateInputValue(): string {
    return this.GetDateInputValue();
  }

  /**
   * Check if the current field has a value list (dropdown options)
   */
  HasValueList(): boolean {
    return !!(this.SelectedField?.valueList && this.SelectedField.valueList.length > 0);
  }

  /** @deprecated Use {@link HasValueList}. */
  hasValueList(): boolean {
    return this.HasValueList();
  }
}
