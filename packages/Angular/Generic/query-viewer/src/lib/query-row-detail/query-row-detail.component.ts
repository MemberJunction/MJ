import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnDestroy,
    ChangeDetectorRef,
    ChangeDetectionStrategy,
    ElementRef,
    HostListener
} from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { Metadata, QueryInfo, QueryFieldInfo, EntityInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { QueryGridColumnConfig } from '../query-data-grid/models/query-grid-types';

/**
 * Event emitted when navigating to a linked entity record
 */
export interface RowDetailEntityLinkEvent {
    entityName: string;
    recordId: string;
    fieldName: string;
}

/**
 * Field display configuration for the detail panel
 */
interface DetailField {
    name: string;
    displayName: string;
    value: unknown;
    formattedValue: string;
    sqlType: string;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    targetEntityName?: string;
    targetEntityIcon?: string;
    sourceEntityName?: string;
    isLongText: boolean;
    isExpanded: boolean;
}

/**
 * Settings key for panel width persistence
 */
const PANEL_WIDTH_SETTING_KEY = 'QueryViewer_RowDetailPanel_Width';

/**
 * Settings key for hide empty fields preference
 */
const HIDE_EMPTY_FIELDS_KEY = 'QueryViewer_RowDetailPanel_HideEmptyFields';

/**
 * Row detail slide-in panel component.
 * Displays a single row's data in a formatted, grouped view with entity links.
 */
@Component({
    selector: 'mj-query-row-detail',
    templateUrl: './query-row-detail.component.html',
    styleUrls: ['./query-row-detail.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    animations: [
        trigger('slideIn', [
            transition(':enter', [
                style({ transform: 'translateX(100%)', opacity: 0 }),
                animate('200ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
            ]),
            transition(':leave', [
                animate('150ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
            ])
        ])
    ]
})
export class QueryRowDetailComponent implements OnInit, OnDestroy {
    // ========================================
    // Inputs
    // ========================================

    private _rowData: Record<string, unknown> | null = null;
    @Input()
    set RowData(value: Record<string, unknown> | null) {
        this._rowData = value;
        if (value) {
            this.buildDetailFields();
        }
    }
    get RowData(): Record<string, unknown> | null {
        return this._rowData;
    }

    private _columns: QueryGridColumnConfig[] = [];
    @Input()
    set Columns(value: QueryGridColumnConfig[]) {
        this._columns = value || [];
        if (this._rowData) {
            this.buildDetailFields();
        }
    }
    get Columns(): QueryGridColumnConfig[] {
        return this._columns;
    }

    @Input() QueryInfo: QueryInfo | null = null;
    @Input() Visible: boolean = false;
    @Input() RowIndex: number = 0;
    @Input() TotalRows: number = 0;

    // ========================================
    // Outputs
    // ========================================

    @Output() Close = new EventEmitter<void>();
    @Output() EntityLinkClick = new EventEmitter<RowDetailEntityLinkEvent>();
    @Output() NavigateRow = new EventEmitter<'prev' | 'next'>();

    // ========================================
    // Internal State
    // ========================================

    public PrimaryKeyFields: DetailField[] = [];
    public ForeignKeyFields: DetailField[] = [];
    public RegularFields: DetailField[] = [];
    public PanelWidth: number = 400;
    public IsResizing: boolean = false;
    public HideEmptyFields: boolean = true;

    private destroy$ = new Subject<void>();
    private widthPersistSubject = new Subject<number>();
    private metadata = new Metadata();
    private minWidth = 300;
    private maxWidth = 800;

    constructor(
        private cdr: ChangeDetectorRef,
        private elementRef: ElementRef
    ) {
        // Debounce width persistence
        this.widthPersistSubject.pipe(
            debounceTime(500),
            takeUntil(this.destroy$)
        ).subscribe(width => {
            this.persistPanelWidth(width);
        });
    }

    ngOnInit(): void {
        this.loadPersistedWidth();
        this.loadHideEmptyFieldsPreference();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ========================================
    // Field Building
    // ========================================

    private buildDetailFields(): void {
        if (!this._rowData || !this._columns.length) {
            this.PrimaryKeyFields = [];
            this.ForeignKeyFields = [];
            this.RegularFields = [];
            return;
        }

        const primaryKeys: DetailField[] = [];
        const foreignKeys: DetailField[] = [];
        const regular: DetailField[] = [];

        for (const col of this._columns) {
            const value = this._rowData[col.field];
            const field = this.buildDetailField(col, value);

            if (field.isPrimaryKey) {
                primaryKeys.push(field);
            } else if (field.isForeignKey) {
                foreignKeys.push(field);
            } else {
                regular.push(field);
            }
        }

        this.PrimaryKeyFields = primaryKeys;
        this.ForeignKeyFields = foreignKeys;
        this.RegularFields = regular;
        this.cdr.markForCheck();
    }

    private buildDetailField(col: QueryGridColumnConfig, value: unknown): DetailField {
        const formattedValue = this.formatValue(value, col);
        const isLongText = typeof value === 'string' && value.length > 200;

        return {
            name: col.field,
            displayName: col.title,
            value,
            formattedValue,
            sqlType: col.sqlBaseType,
            isPrimaryKey: col.isPrimaryKey || false,
            isForeignKey: col.isForeignKey || false,
            targetEntityName: col.targetEntityName,
            targetEntityIcon: col.targetEntityIcon,
            sourceEntityName: col.sourceEntityName,
            isLongText,
            isExpanded: false
        };
    }

    private formatValue(value: unknown, col: QueryGridColumnConfig): string {
        if (value === null || value === undefined) {
            return '(empty)';
        }

        const baseType = col.sqlBaseType.toLowerCase();

        // Boolean
        if (baseType === 'bit') {
            return value ? 'Yes' : 'No';
        }

        // Date/Time
        if (['date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset'].includes(baseType)) {
            const date = new Date(value as string);
            if (isNaN(date.getTime())) return String(value);

            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            let relativeTime = '';
            if (diffHours < 1) {
                relativeTime = 'just now';
            } else if (diffHours < 24) {
                relativeTime = `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
            } else if (diffDays < 7) {
                relativeTime = `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
            }

            const formatted = baseType === 'date'
                ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                : date.toLocaleString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: 'numeric', minute: '2-digit'
                });

            return relativeTime ? `${formatted} • ${relativeTime}` : formatted;
        }

        // Numbers
        if (['int', 'bigint', 'smallint', 'tinyint'].includes(baseType)) {
            const num = Number(value);
            if (isNaN(num)) return String(value);
            return num.toLocaleString();
        }

        if (['decimal', 'numeric', 'float', 'real'].includes(baseType)) {
            const num = Number(value);
            if (isNaN(num)) return String(value);
            return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
        }

        if (['money', 'smallmoney'].includes(baseType)) {
            const num = Number(value);
            if (isNaN(num)) return String(value);
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
        }

        // JSON detection
        const strValue = String(value);
        if (strValue.startsWith('{') || strValue.startsWith('[')) {
            try {
                JSON.parse(strValue);
                return strValue; // Will be formatted as JSON in template
            } catch {
                // Not valid JSON, continue
            }
        }

        return strValue;
    }

    // ========================================
    // User Actions
    // ========================================

    public onClose(): void {
        this.Close.emit();
    }

    public onEntityLinkClick(field: DetailField): void {
        if (field.targetEntityName && field.value != null) {
            this.EntityLinkClick.emit({
                entityName: field.targetEntityName,
                recordId: String(field.value),
                fieldName: field.name
            });
        }
    }

    public onNavigatePrev(): void {
        this.NavigateRow.emit('prev');
    }

    public onNavigateNext(): void {
        this.NavigateRow.emit('next');
    }

    public toggleFieldExpand(field: DetailField): void {
        field.isExpanded = !field.isExpanded;
        this.cdr.markForCheck();
    }

    public copyValue(field: DetailField): void {
        const textToCopy = field.value != null ? String(field.value) : '';
        navigator.clipboard.writeText(textToCopy);
    }

    public copyRowAsJson(): void {
        if (this._rowData) {
            const json = JSON.stringify(this._rowData, null, 2);
            navigator.clipboard.writeText(json);
        }
    }

    public isJson(value: string): boolean {
        if (!value || typeof value !== 'string') return false;
        const trimmed = value.trim();
        return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
               (trimmed.startsWith('[') && trimmed.endsWith(']'));
    }

    public formatJson(value: string): string {
        try {
            return JSON.stringify(JSON.parse(value), null, 2);
        } catch {
            return value;
        }
    }

    // ========================================
    // Resize Handling
    // ========================================

    public onResizeStart(event: MouseEvent): void {
        event.preventDefault();
        this.IsResizing = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }

    @HostListener('document:mousemove', ['$event'])
    onMouseMove(event: MouseEvent): void {
        if (!this.IsResizing) return;

        const containerRect = this.elementRef.nativeElement.parentElement?.getBoundingClientRect();
        if (!containerRect) return;

        const newWidth = containerRect.right - event.clientX;
        this.PanelWidth = Math.min(Math.max(newWidth, this.minWidth), this.maxWidth);
        this.cdr.markForCheck();
    }

    @HostListener('document:mouseup')
    onMouseUp(): void {
        if (this.IsResizing) {
            this.IsResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            this.widthPersistSubject.next(this.PanelWidth);
        }
    }

    // ========================================
    // Persistence
    // ========================================

    private loadPersistedWidth(): void {
        try {
            const savedWidth = UserInfoEngine.Instance.GetSetting(PANEL_WIDTH_SETTING_KEY);
            if (savedWidth) {
                const width = parseInt(savedWidth, 10);
                if (!isNaN(width) && width >= this.minWidth && width <= this.maxWidth) {
                    this.PanelWidth = width;
                }
            }
        } catch (error) {
            console.error('[query-row-detail] Failed to load persisted width:', error);
        }
    }

    private async persistPanelWidth(width: number): Promise<void> {
        try {
            await UserInfoEngine.Instance.SetSetting(PANEL_WIDTH_SETTING_KEY, String(width));
        } catch (error) {
            console.error('[query-row-detail] Failed to persist panel width:', error);
        }
    }

    private loadHideEmptyFieldsPreference(): void {
        try {
            const saved = UserInfoEngine.Instance.GetSetting(HIDE_EMPTY_FIELDS_KEY);
            if (saved !== undefined) {
                this.HideEmptyFields = saved === 'true';
            }
        } catch (error) {
            console.error('[query-row-detail] Failed to load hide empty fields preference:', error);
        }
    }

    private async persistHideEmptyFieldsPreference(): Promise<void> {
        try {
            await UserInfoEngine.Instance.SetSetting(HIDE_EMPTY_FIELDS_KEY, String(this.HideEmptyFields));
        } catch (error) {
            console.error('[query-row-detail] Failed to persist hide empty fields preference:', error);
        }
    }

    public toggleHideEmptyFields(): void {
        this.HideEmptyFields = !this.HideEmptyFields;
        this.persistHideEmptyFieldsPreference();
        this.cdr.markForCheck();
    }

    /**
     * Returns visible fields based on HideEmptyFields setting
     */
    public getVisibleFields(fields: DetailField[]): DetailField[] {
        if (!this.HideEmptyFields) {
            return fields;
        }
        return fields.filter(f => f.value !== null && f.value !== undefined && f.value !== '');
    }

    /**
     * Returns count of empty fields for display
     */
    public getEmptyFieldCount(fields: DetailField[]): number {
        return fields.filter(f => f.value === null || f.value === undefined || f.value === '').length;
    }

    // ========================================
    // Keyboard Navigation
    // ========================================

    @HostListener('document:keydown', ['$event'])
    onKeyDown(event: KeyboardEvent): void {
        if (!this.Visible) return;

        if (event.key === 'Escape') {
            this.onClose();
        } else if (event.key === 'ArrowUp' || event.key === 'k') {
            if (this.RowIndex > 0) {
                this.onNavigatePrev();
            }
        } else if (event.key === 'ArrowDown' || event.key === 'j') {
            if (this.RowIndex < this.TotalRows - 1) {
                this.onNavigateNext();
            }
        }
    }
}
