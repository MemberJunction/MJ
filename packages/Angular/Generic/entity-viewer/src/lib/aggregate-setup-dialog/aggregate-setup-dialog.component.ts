import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { ViewGridAggregate, AggregateDisplayType } from '@memberjunction/core-entities';

/**
 * Aggregate function types for simple mode
 */
export type AggregateFunctionType = 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'COUNT_DISTINCT';

/**
 * Aggregate setup mode
 */
export type AggregateSetupMode = 'simple' | 'advanced' | 'smart';

/**
 * Default icons for aggregate functions
 */
const FUNCTION_ICONS: Record<AggregateFunctionType, string> = {
  'SUM': 'fa-solid fa-plus',
  'AVG': 'fa-solid fa-divide',
  'COUNT': 'fa-solid fa-hashtag',
  'MIN': 'fa-solid fa-arrow-down',
  'MAX': 'fa-solid fa-arrow-up',
  'COUNT_DISTINCT': 'fa-solid fa-fingerprint'
};

/**
 * Friendly labels for aggregate functions
 */
const FUNCTION_LABELS: Record<AggregateFunctionType, string> = {
  'SUM': 'Sum',
  'AVG': 'Average',
  'COUNT': 'Count',
  'MIN': 'Minimum',
  'MAX': 'Maximum',
  'COUNT_DISTINCT': 'Count Distinct'
};

/**
 * AggregateSetupDialogComponent - Dialog for creating/editing aggregate configurations
 *
 * Features:
 * - Simple mode: Pick column + aggregate function (SUM, AVG, COUNT, etc.)
 * - Advanced mode: Write custom SQL expression
 * - Smart mode: Describe in natural language (AI generates expression)
 * - Progressive disclosure - simple mode covers 80% of use cases
 * - Display type selection (card or column)
 * - Optional label and icon customization
 */
@Component({
  selector: 'mj-aggregate-setup-dialog',
  templateUrl: './aggregate-setup-dialog.component.html',
  styleUrls: ['./aggregate-setup-dialog.component.css']
})
export class AggregateSetupDialogComponent implements OnInit, OnChanges {
  /**
   * The entity being viewed - provides field information
   */
  @Input() Entity: EntityInfo | null = null;

  /**
   * Existing aggregate to edit (null for new)
   */
  @Input() Aggregate: ViewGridAggregate | null = null;

  /**
   * Whether the dialog is open
   */
  @Input() IsOpen: boolean = false;

  /**
   * Emitted when the dialog is closed
   */
  @Output() Close = new EventEmitter<void>();

  /**
   * Emitted when an aggregate is saved
   */
  @Output() Save = new EventEmitter<ViewGridAggregate>();

  // Setup mode
  Mode: AggregateSetupMode = 'simple';

  // Simple mode state
  SelectedColumn: string = '';
  SelectedFunction: AggregateFunctionType = 'SUM';

  // Advanced mode state
  Expression: string = '';

  // Smart mode state
  SmartPrompt: string = '';
  GeneratedExpression: string = '';
  IsGenerating: boolean = false;

  // Common configuration
  Label: string = '';
  DisplayType: AggregateDisplayType = 'card';
  Icon: string = '';
  Description: string = '';

  // Available functions
  AggregateFunctions: { value: AggregateFunctionType; label: string; icon: string }[] = [
    { value: 'SUM', label: 'Sum', icon: 'fa-solid fa-plus' },
    { value: 'AVG', label: 'Average', icon: 'fa-solid fa-divide' },
    { value: 'COUNT', label: 'Count', icon: 'fa-solid fa-hashtag' },
    { value: 'MIN', label: 'Minimum', icon: 'fa-solid fa-arrow-down' },
    { value: 'MAX', label: 'Maximum', icon: 'fa-solid fa-arrow-up' },
    { value: 'COUNT_DISTINCT', label: 'Count Distinct', icon: 'fa-solid fa-fingerprint' }
  ];

  // Common icons for selection
  CommonIcons: string[] = [
    'fa-solid fa-chart-line',
    'fa-solid fa-chart-bar',
    'fa-solid fa-dollar-sign',
    'fa-solid fa-users',
    'fa-solid fa-shopping-cart',
    'fa-solid fa-box',
    'fa-solid fa-clock',
    'fa-solid fa-calendar',
    'fa-solid fa-percent',
    'fa-solid fa-star',
    'fa-solid fa-check-circle',
    'fa-solid fa-exclamation-triangle'
  ];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.initializeFromAggregate();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Re-initialize when dialog opens or aggregate changes
    if (changes['IsOpen'] && this.IsOpen) {
      this.initializeFromAggregate();
    }
    if (changes['Aggregate'] && !changes['Aggregate'].firstChange) {
      this.initializeFromAggregate();
    }
  }

  /**
   * Initialize form state from existing aggregate (if editing)
   */
  private initializeFromAggregate(): void {
    if (!this.Aggregate) {
      this.resetForm();
      return;
    }

    const agg = this.Aggregate;

    // Set common fields
    this.Label = agg.label || '';
    this.DisplayType = agg.displayType || 'card';
    this.Icon = agg.icon || '';
    this.Description = agg.description || '';

    // Determine mode and populate fields
    if (agg.smartPrompt) {
      // Smart mode - has AI prompt
      this.Mode = 'smart';
      this.SmartPrompt = agg.smartPrompt;
      this.GeneratedExpression = agg.expression;
      this.Expression = agg.expression;
    } else if (this.isSimpleExpression(agg.expression)) {
      // Simple mode - can be represented as function(column)
      this.Mode = 'simple';
      const parsed = this.parseSimpleExpression(agg.expression);
      if (parsed) {
        this.SelectedFunction = parsed.func;
        this.SelectedColumn = parsed.column;
      }
    } else {
      // Advanced mode - custom expression
      this.Mode = 'advanced';
      this.Expression = agg.expression;
    }

    this.cdr.detectChanges();
  }

  /**
   * Reset form to default state
   */
  private resetForm(): void {
    this.Mode = 'simple';
    this.SelectedColumn = '';
    this.SelectedFunction = 'SUM';
    this.Expression = '';
    this.SmartPrompt = '';
    this.GeneratedExpression = '';
    this.Label = '';
    this.DisplayType = 'card';
    this.Icon = '';
    this.Description = '';
  }

  /**
   * Check if an expression matches simple function(column) pattern
   */
  private isSimpleExpression(expression: string): boolean {
    const pattern = /^(SUM|AVG|COUNT|MIN|MAX|COUNT_DISTINCT)\s*\(\s*\[?[\w\s]+\]?\s*\)$/i;
    return pattern.test(expression.trim());
  }

  /**
   * Parse a simple expression into function and column
   */
  private parseSimpleExpression(expression: string): { func: AggregateFunctionType; column: string } | null {
    const match = expression.trim().match(/^(SUM|AVG|COUNT|MIN|MAX|COUNT_DISTINCT)\s*\(\s*\[?([\w\s]+)\]?\s*\)$/i);
    if (!match) return null;

    const funcName = match[1].toUpperCase().replace(' ', '_') as AggregateFunctionType;
    const column = match[2].trim();

    return { func: funcName, column };
  }

  /**
   * Get numeric fields for SUM/AVG operations
   */
  get NumericFields(): EntityFieldInfo[] {
    if (!this.Entity) return [];
    return this.Entity.Fields.filter(f => {
      const sqlType = f.Type.toLowerCase();
      return sqlType.includes('int') ||
             sqlType.includes('decimal') ||
             sqlType.includes('numeric') ||
             sqlType.includes('float') ||
             sqlType.includes('real') ||
             sqlType.includes('money');
    });
  }

  /**
   * Get date/datetime fields for MIN/MAX operations
   */
  get DateFields(): EntityFieldInfo[] {
    if (!this.Entity) return [];
    return this.Entity.Fields.filter(f => {
      const sqlType = f.Type.toLowerCase();
      return sqlType.includes('date') || sqlType.includes('time');
    });
  }

  /**
   * Get string fields for MIN/MAX operations
   */
  get StringFields(): EntityFieldInfo[] {
    if (!this.Entity) return [];
    return this.Entity.Fields.filter(f => {
      const sqlType = f.Type.toLowerCase();
      return (sqlType.includes('char') || sqlType.includes('text')) && !f.IsBinaryFieldType;
    });
  }

  /**
   * Get all fields for COUNT operations
   */
  get AllFields(): EntityFieldInfo[] {
    if (!this.Entity) return [];
    return this.Entity.Fields.filter(f => !f.IsBinaryFieldType);
  }

  /**
   * Get fields available for current function
   */
  get AvailableFields(): EntityFieldInfo[] {
    // COUNT and COUNT_DISTINCT can use any field
    if (this.SelectedFunction === 'COUNT' || this.SelectedFunction === 'COUNT_DISTINCT') {
      return this.AllFields;
    }
    // SUM and AVG only work with numeric fields
    if (this.SelectedFunction === 'SUM' || this.SelectedFunction === 'AVG') {
      return this.NumericFields;
    }
    // MIN and MAX work with numeric and date fields only (not text/varchar)
    if (this.SelectedFunction === 'MIN' || this.SelectedFunction === 'MAX') {
      // Combine numeric and date fields (avoiding duplicates)
      const combined = [...this.NumericFields, ...this.DateFields];
      // Remove duplicates by field ID
      const seen = new Set<string>();
      return combined.filter(f => {
        if (seen.has(f.ID)) return false;
        seen.add(f.ID);
        return true;
      });
    }
    // Default to all fields
    return this.AllFields;
  }

  /**
   * Set the setup mode
   */
  setMode(mode: AggregateSetupMode): void {
    this.Mode = mode;

    // If switching from smart mode with generated expression, populate advanced mode
    if (mode === 'advanced' && this.GeneratedExpression) {
      this.Expression = this.GeneratedExpression;
    }

    this.cdr.detectChanges();
  }

  /**
   * Handle function selection change
   */
  onFunctionChange(): void {
    // If current column is not valid for new function, clear it
    const validFields = this.AvailableFields;
    if (this.SelectedColumn && !validFields.find(f => f.Name === this.SelectedColumn)) {
      this.SelectedColumn = '';
    }

    // Auto-generate label if not set
    if (!this.Label && this.SelectedColumn) {
      this.updateAutoLabel();
    }

    this.cdr.detectChanges();
  }

  /**
   * Handle column selection change
   */
  onColumnChange(): void {
    // Auto-generate label if not set
    this.updateAutoLabel();
    this.cdr.detectChanges();
  }

  /**
   * Update auto-generated label based on function and column
   */
  private updateAutoLabel(): void {
    if (!this.SelectedColumn || !this.SelectedFunction) return;

    const field = this.Entity?.Fields.find(f => f.Name === this.SelectedColumn);
    if (field) {
      const funcLabel = FUNCTION_LABELS[this.SelectedFunction] || this.SelectedFunction;
      this.Label = `${funcLabel} of ${field.DisplayNameOrName}`;
    }
  }

  /**
   * Select an icon
   */
  selectIcon(icon: string): void {
    this.Icon = icon;
    this.cdr.detectChanges();
  }

  /**
   * Clear the icon
   */
  clearIcon(): void {
    this.Icon = '';
    this.cdr.detectChanges();
  }

  /**
   * Build the expression based on current mode
   */
  private buildExpression(): string {
    switch (this.Mode) {
      case 'simple':
        if (!this.SelectedColumn || !this.SelectedFunction) return '';
        // Use brackets for column names with spaces
        const columnRef = this.SelectedColumn.includes(' ')
          ? `[${this.SelectedColumn}]`
          : this.SelectedColumn;
        if (this.SelectedFunction === 'COUNT_DISTINCT') {
          return `COUNT(DISTINCT ${columnRef})`;
        }
        return `${this.SelectedFunction}(${columnRef})`;

      case 'advanced':
        return this.Expression;

      case 'smart':
        return this.GeneratedExpression || '';

      default:
        return '';
    }
  }

  /**
   * Check if the form is valid
   */
  get IsValid(): boolean {
    const hasExpression = !!this.buildExpression();
    const hasLabel = !!this.Label.trim();
    return hasExpression && hasLabel;
  }

  /**
   * Get validation message
   */
  get ValidationMessage(): string {
    if (!this.Label.trim()) {
      return 'Please enter a label for this aggregate';
    }

    switch (this.Mode) {
      case 'simple':
        if (!this.SelectedColumn) return 'Please select a column';
        break;
      case 'advanced':
        if (!this.Expression.trim()) return 'Please enter an expression';
        break;
      case 'smart':
        if (!this.GeneratedExpression) return 'Please generate an expression from your prompt';
        break;
    }

    return '';
  }

  /**
   * Save the aggregate
   */
  onSave(): void {
    if (!this.IsValid) return;

    const aggregate: ViewGridAggregate = {
      id: this.Aggregate?.id || this.generateId(),
      expression: this.buildExpression(),
      displayType: this.DisplayType,
      label: this.Label.trim(),
      description: this.Description.trim() || undefined,
      icon: this.Icon || this.getDefaultIcon(),
      enabled: this.Aggregate?.enabled ?? true, // Preserve enabled state when editing, default to true for new
      order: this.Aggregate?.order || 0
    };

    // Only include smartPrompt if in smart mode
    if (this.Mode === 'smart' && this.SmartPrompt) {
      aggregate.smartPrompt = this.SmartPrompt;
    }

    this.Save.emit(aggregate);
    this.onClose();
  }

  /**
   * Get default icon based on function
   */
  private getDefaultIcon(): string {
    if (this.Mode === 'simple' && this.SelectedFunction) {
      return FUNCTION_ICONS[this.SelectedFunction] || 'fa-solid fa-chart-simple';
    }
    return 'fa-solid fa-chart-simple';
  }

  /**
   * Generate a unique ID for new aggregates
   */
  private generateId(): string {
    return `agg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close the dialog
   */
  onClose(): void {
    this.Close.emit();
  }

  /**
   * Handle smart prompt generation (placeholder - actual AI call would be made by parent)
   */
  onGenerateFromPrompt(): void {
    if (!this.SmartPrompt.trim()) return;

    this.IsGenerating = true;
    this.cdr.detectChanges();

    // This would typically call an AI service
    // For now, we'll show a placeholder message
    // The actual implementation would be handled by the parent component or a service
    setTimeout(() => {
      this.IsGenerating = false;
      // Placeholder: In real implementation, this would be replaced with AI-generated expression
      this.GeneratedExpression = '/* AI-generated expression will appear here */';
      this.cdr.detectChanges();
    }, 500);
  }

  /**
   * Clear the generated expression and allow editing prompt
   */
  clearGeneratedExpression(): void {
    this.GeneratedExpression = '';
    this.cdr.detectChanges();
  }

  /**
   * Get display label for field dropdown showing "Name (DisplayName)" format
   * If DisplayName equals Name or is not set, just show Name
   */
  getFieldDisplayLabel(field: EntityFieldInfo): string {
    if (field.DisplayName && field.DisplayName !== field.Name) {
      return `${field.Name} (${field.DisplayName})`;
    }
    return field.Name;
  }
}
