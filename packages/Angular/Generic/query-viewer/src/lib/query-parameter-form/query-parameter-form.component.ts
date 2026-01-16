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
 *   [queryInfo]="query"
 *   [initialValues]="savedParams"
 *   [isOpen]="showParams"
 *   (parametersSubmit)="onRunQuery($event)"
 *   (close)="showParams = false">
 * </mj-query-parameter-form>
 * ```
 */
@Component({
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
    @Input() queryInfo: QueryInfo | null = null;

    /**
     * Initial values to populate the form (e.g., from saved state)
     */
    @Input() initialValues: QueryParameterValues = {};

    /**
     * Whether the panel is open/visible
     */
    @Input() isOpen: boolean = false;

    /**
     * Panel width in pixels
     */
    @Input() panelWidth: number = 400;

    /**
     * Whether to show the overlay backdrop
     */
    @Input() showOverlay: boolean = true;

    // ========================================
    // Outputs
    // ========================================

    /**
     * Fired when user submits the form with valid parameters
     */
    @Output() parametersSubmit = new EventEmitter<QueryParameterValues>();

    /**
     * Fired when panel is closed
     */
    @Output() close = new EventEmitter<void>();

    // ========================================
    // Internal State
    // ========================================

    public fields: ParameterField[] = [];
    public hasRequiredParams: boolean = false;
    public allRequiredFilled: boolean = false;

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        this.buildForm();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['queryInfo'] || changes['initialValues']) {
            this.buildForm();
        }
    }

    ngOnDestroy(): void {}

    // ========================================
    // Form Building
    // ========================================

    private buildForm(): void {
        if (!this.queryInfo) {
            this.fields = [];
            this.hasRequiredParams = false;
            return;
        }

        const parameters = this.queryInfo.Parameters || [];

        this.fields = parameters.map(param => {
            const initialValue = this.getInitialValue(param);

            return {
                info: param,
                value: initialValue,
                error: null,
                touched: false
            };
        });

        this.hasRequiredParams = this.fields.some(f => f.info.IsRequired);
        this.validateAllFields();
        this.cdr.markForCheck();
    }

    private getInitialValue(param: QueryParameterInfo): string | number | boolean | Date | string[] | null {
        // Check initial values first
        if (this.initialValues && this.initialValues[param.Name] !== undefined) {
            return this.initialValues[param.Name];
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

    public onValueChange(field: ParameterField, value: unknown): void {
        field.value = value as ParameterField['value'];
        field.touched = true;
        this.validateField(field);
        this.updateAllRequiredFilled();
        this.cdr.markForCheck();
    }

    public onDateChange(field: ParameterField, value: Date | null): void {
        field.value = value;
        field.touched = true;
        this.validateField(field);
        this.updateAllRequiredFilled();
        this.cdr.markForCheck();
    }

    public onCheckboxChange(field: ParameterField, event: Event): void {
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
        for (const field of this.fields) {
            this.validateField(field);
        }
        this.updateAllRequiredFilled();
    }

    private updateAllRequiredFilled(): void {
        this.allRequiredFilled = this.fields
            .filter(f => f.info.IsRequired)
            .every(f => {
                const value = f.value;
                if (value === null || value === undefined || value === '') return false;
                if (f.info.Type === 'array' && Array.isArray(value) && value.length === 0) return false;
                return f.error === null;
            });
    }

    public get hasErrors(): boolean {
        return this.fields.some(f => f.error !== null);
    }

    public get canSubmit(): boolean {
        return !this.hasErrors && this.allRequiredFilled;
    }

    // ========================================
    // Form Submission
    // ========================================

    public submit(): void {
        // Mark all fields as touched
        for (const field of this.fields) {
            field.touched = true;
        }
        this.validateAllFields();

        if (!this.canSubmit) {
            this.cdr.markForCheck();
            return;
        }

        // Build parameter values object
        const values: QueryParameterValues = {};
        for (const field of this.fields) {
            if (field.value !== null && field.value !== undefined) {
                values[field.info.Name] = field.value;
            }
        }

        this.parametersSubmit.emit(values);
    }

    public cancel(): void {
        this.close.emit();
    }

    public reset(): void {
        this.buildForm();
    }

    // ========================================
    // UI Helpers
    // ========================================

    public getInputType(param: QueryParameterInfo): string {
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

    public getPlaceholder(param: QueryParameterInfo): string {
        if (param.SampleValue) {
            return `e.g., ${param.SampleValue}`;
        }
        return param.Description || '';
    }

    public trackByField(index: number, field: ParameterField): string {
        return field.info.Name;
    }

    // ========================================
    // Type-Safe Value Getters for Template
    // ========================================

    public getStringValue(value: ParameterField['value']): string {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        return String(value);
    }

    public getNumberValue(value: ParameterField['value']): number | null {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number') return value;
        const num = Number(value);
        return isNaN(num) ? null : num;
    }

    public getDateValue(value: ParameterField['value']): string {
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

    public getBooleanValue(value: ParameterField['value']): boolean {
        if (value === null || value === undefined) return false;
        return Boolean(value);
    }

    public getArrayDisplayValue(value: ParameterField['value']): string {
        if (value === null || value === undefined) return '';
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        return String(value);
    }

    // ========================================
    // Input Event Handlers
    // ========================================

    public onInputChange(field: ParameterField, event: Event): void {
        const input = event.target as HTMLInputElement;
        this.onValueChange(field, input.value);
    }

    public onNumberInputChange(field: ParameterField, event: Event): void {
        const input = event.target as HTMLInputElement;
        const value = input.value === '' ? null : Number(input.value);
        this.onValueChange(field, value);
    }

    public onDateInputChange(field: ParameterField, event: Event): void {
        const input = event.target as HTMLInputElement;
        const value = input.value ? new Date(input.value) : null;
        this.onDateChange(field, value);
    }

    public onArrayInputChange(field: ParameterField, event: Event): void {
        const input = event.target as HTMLInputElement;
        const value = input.value
            ? input.value.split(',').map(s => s.trim()).filter(s => s)
            : [];
        this.onValueChange(field, value);
    }
}
