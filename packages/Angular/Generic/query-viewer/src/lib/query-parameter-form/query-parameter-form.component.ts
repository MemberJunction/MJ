import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnDestroy,
    OnChanges,
    SimpleChanges,
    ChangeDetectorRef,
    ChangeDetectionStrategy
} from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { QueryInfo, QueryParameterInfo } from '@memberjunction/core';
import { QueryParameterValues } from '../query-data-grid/models/query-grid-types';

/**
 * A single parameter field in the form
 */
interface ParameterField {
    info: QueryParameterInfo;
    value: string | number | boolean | Date | string[] | null;
    error: string | null;
    touched: boolean;
}

/**
 * A slide-in form for entering query parameters before execution.
 * Features:
 * - Dynamic form generation from QueryParameterInfo metadata
 * - Type-appropriate input controls (text, number, date, checkbox, multi-select)
 * - Validation with helpful error messages
 * - Sample values as placeholders
 * - Description tooltips
 *
 * @example
 * ```html
 * <mj-query-parameter-form
 *   [QueryInfo]="query"
 *   [InitialValues]="savedParams"
 *   [IsOpen]="showParams"
 *   (ParametersSubmit)="onRunQuery($event)"
 *   (Close)="showParams = false">
 * </mj-query-parameter-form>
 * ```
 */
@Component({
  standalone: false,
    selector: 'mj-query-parameter-form',
    templateUrl: './query-parameter-form.component.html',
    styleUrls: ['./query-parameter-form.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    animations: [
        trigger('slideIn', [
            transition(':enter', [
                style({ transform: 'translateX(100%)', opacity: 0 }),
                animate('250ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
            ]),
            transition(':leave', [
                animate('200ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
            ])
        ]),
        trigger('fadeIn', [
            transition(':enter', [
                style({ opacity: 0 }),
                animate('150ms ease-out', style({ opacity: 1 }))
            ]),
            transition(':leave', [
                animate('100ms ease-in', style({ opacity: 0 }))
            ])
        ])
    ]
})
export class QueryParameterFormComponent implements OnInit, OnChanges, OnDestroy {
    // ========================================
    // Inputs
    // ========================================

    /**
     * The query metadata containing parameter definitions
     */
    @Input() QueryInfo: QueryInfo | null = null;

    /**
     * Initial values to populate the form (e.g., from saved state)
     */
    @Input() InitialValues: QueryParameterValues = {};

    /**
     * Whether the panel is open/visible
     */
    @Input() IsOpen: boolean = false;

    /**
     * Panel width in pixels
     */
    @Input() PanelWidth: number = 400;

    /**
     * Whether to show the overlay backdrop
     */
    @Input() ShowOverlay: boolean = true;

    // ========================================
    // Outputs
    // ========================================

    /**
     * Fired when user submits the form with valid parameters
     */
    @Output() ParametersSubmit = new EventEmitter<QueryParameterValues>();

    /**
     * Fired when panel is closed
     */
    @Output() Close = new EventEmitter<void>();

    // ========================================
    // Internal State
    // ========================================

    public Fields: ParameterField[] = [];
    public HasRequiredParams: boolean = false;
    public AllRequiredFilled: boolean = false;

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        this.buildForm();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['QueryInfo'] || changes['InitialValues']) {
            this.buildForm();
        }
    }

    ngOnDestroy(): void {}

    // ========================================
    // Form Building
    // ========================================

    private buildForm(): void {
        if (!this.QueryInfo) {
            this.Fields = [];
            this.HasRequiredParams = false;
            return;
        }

        const parameters = this.QueryInfo.Parameters || [];

        this.Fields = parameters.map(param => {
            const initialValue = this.getInitialValue(param);

            return {
                info: param,
                value: initialValue,
                error: null,
                touched: false
            };
        });

        this.HasRequiredParams = this.Fields.some(f => f.info.IsRequired);
        this.validateAllFields();
        this.cdr.markForCheck();
    }

    private getInitialValue(param: QueryParameterInfo): string | number | boolean | Date | string[] | null {
        // Check initial values first
        if (this.InitialValues && this.InitialValues[param.Name] !== undefined) {
            return this.InitialValues[param.Name];
        }

        // Fall back to default value
        if (param.DefaultValue !== null && param.DefaultValue !== undefined) {
            return this.parseDefaultValue(param);
        }

        // Type-specific defaults
        switch (param.Type) {
            case 'boolean':
                return false;
            case 'array':
                return [];
            default:
                return null;
        }
    }

    private parseDefaultValue(param: QueryParameterInfo): string | number | boolean | Date | string[] | null {
        const defaultValue = param.DefaultValue;
        if (defaultValue === null || defaultValue === undefined) return null;

        try {
            switch (param.Type) {
                case 'number':
                    return Number(defaultValue);
                case 'boolean':
                    return defaultValue.toLowerCase() === 'true' || defaultValue === '1';
                case 'date':
                    return new Date(defaultValue);
                case 'array':
                    return JSON.parse(defaultValue);
                default:
                    return defaultValue;
            }
        } catch {
            return defaultValue;
        }
    }

    // ========================================
    // Value Handling
    // ========================================

    public OnValueChange(field: ParameterField, value: unknown): void {
        field.value = value as ParameterField['value'];
        field.touched = true;
        this.validateField(field);
        this.updateAllRequiredFilled();
        this.cdr.markForCheck();
    }

    public OnDateChange(field: ParameterField, value: Date | null): void {
        field.value = value;
        field.touched = true;
        this.validateField(field);
        this.updateAllRequiredFilled();
        this.cdr.markForCheck();
    }

    public OnCheckboxChange(field: ParameterField, event: Event): void {
        const input = event.target as HTMLInputElement;
        field.value = input.checked;
        field.touched = true;
        this.validateField(field);
        this.updateAllRequiredFilled();
        this.cdr.markForCheck();
    }

    // ========================================
    // Validation
    // ========================================

    private validateField(field: ParameterField): void {
        field.error = null;

        const value = field.value;
        const param = field.info;

        // Required check
        if (param.IsRequired) {
            if (value === null || value === undefined || value === '') {
                field.error = 'This field is required';
                return;
            }
            if (param.Type === 'array' && Array.isArray(value) && value.length === 0) {
                field.error = 'At least one value is required';
                return;
            }
        }

        // Type validation
        if (value !== null && value !== undefined && value !== '') {
            switch (param.Type) {
                case 'number':
                    if (isNaN(Number(value))) {
                        field.error = 'Must be a valid number';
                    }
                    break;
                case 'date':
                    if (value instanceof Date && isNaN(value.getTime())) {
                        field.error = 'Must be a valid date';
                    }
                    break;
            }
        }
    }

    private validateAllFields(): void {
        for (const field of this.Fields) {
            this.validateField(field);
        }
        this.updateAllRequiredFilled();
    }

    private updateAllRequiredFilled(): void {
        this.AllRequiredFilled = this.Fields
            .filter(f => f.info.IsRequired)
            .every(f => {
                const value = f.value;
                if (value === null || value === undefined || value === '') return false;
                if (f.info.Type === 'array' && Array.isArray(value) && value.length === 0) return false;
                return f.error === null;
            });
    }

    public get HasErrors(): boolean {
        return this.Fields.some(f => f.error !== null);
    }

    public get CanSubmit(): boolean {
        return !this.HasErrors && this.AllRequiredFilled;
    }

    // ========================================
    // Form Submission
    // ========================================

    public Submit(): void {
        // Mark all fields as touched
        for (const field of this.Fields) {
            field.touched = true;
        }
        this.validateAllFields();

        if (!this.CanSubmit) {
            this.cdr.markForCheck();
            return;
        }

        // Build parameter values object
        const values: QueryParameterValues = {};
        for (const field of this.Fields) {
            if (field.value !== null && field.value !== undefined) {
                values[field.info.Name] = field.value;
            }
        }

        this.ParametersSubmit.emit(values);
    }

    public Cancel(): void {
        this.Close.emit();
    }

    public Reset(): void {
        this.buildForm();
    }

    // ========================================
    // UI Helpers
    // ========================================

    public GetInputType(param: QueryParameterInfo): string {
        switch (param.Type) {
            case 'number':
                return 'number';
            case 'boolean':
                return 'checkbox';
            case 'date':
                return 'date';
            default:
                return 'text';
        }
    }

    public GetPlaceholder(param: QueryParameterInfo): string {
        if (param.SampleValue) {
            return `e.g., ${param.SampleValue}`;
        }
        return param.Description || '';
    }

    public TrackByField(index: number, field: ParameterField): string {
        return field.info.Name;
    }

    // ========================================
    // Type-Safe Value Getters for Template
    // ========================================

    public GetStringValue(value: ParameterField['value']): string {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        return String(value);
    }

    public GetNumberValue(value: ParameterField['value']): number | null {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number') return value;
        const num = Number(value);
        return isNaN(num) ? null : num;
    }

    public GetDateValue(value: ParameterField['value']): string {
        if (value === null || value === undefined) return '';
        if (value instanceof Date) {
            // Format as YYYY-MM-DD for HTML date input
            return value.toISOString().split('T')[0];
        }
        if (typeof value === 'string') {
            // Try to parse and format
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return date.toISOString().split('T')[0];
            }
        }
        return '';
    }

    public GetBooleanValue(value: ParameterField['value']): boolean {
        if (value === null || value === undefined) return false;
        return Boolean(value);
    }

    public GetArrayDisplayValue(value: ParameterField['value']): string {
        if (value === null || value === undefined) return '';
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        return String(value);
    }

    // ========================================
    // Input Event Handlers
    // ========================================

    public OnInputChange(field: ParameterField, event: Event): void {
        const input = event.target as HTMLInputElement;
        this.OnValueChange(field, input.value);
    }

    public OnNumberInputChange(field: ParameterField, event: Event): void {
        const input = event.target as HTMLInputElement;
        const value = input.value === '' ? null : Number(input.value);
        this.OnValueChange(field, value);
    }

    public OnDateInputChange(field: ParameterField, event: Event): void {
        const input = event.target as HTMLInputElement;
        const value = input.value ? new Date(input.value) : null;
        this.OnDateChange(field, value);
    }

    public OnArrayInputChange(field: ParameterField, event: Event): void {
        const input = event.target as HTMLInputElement;
        const value = input.value
            ? input.value.split(',').map(s => s.trim()).filter(s => s)
            : [];
        this.OnValueChange(field, value);
    }
}
