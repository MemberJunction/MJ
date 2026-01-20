import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectorRef,
    ChangeDetectionStrategy,
    OnInit,
    OnDestroy,
    HostListener
} from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { QueryInfo, QueryFieldInfo, QueryParameterInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';

/**
 * User Settings key for info panel width
 */
const INFO_PANEL_WIDTH_KEY = 'QueryViewer_InfoPanelWidth';

/**
 * Event emitted when opening the full query record
 */
export interface OpenQueryRecordEvent {
    queryId: string;
    queryName: string;
}

/**
 * A slide-in panel that displays detailed query information.
 * Features:
 * - Expandable sections for fields, parameters, and SQL
 * - Resizable width with persistence
 * - Open button to navigate to full record
 */
@Component({
    selector: 'mj-query-info-panel',
    templateUrl: './query-info-panel.component.html',
    styleUrls: ['./query-info-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    animations: [
        trigger('slideIn', [
            transition(':enter', [
                style({ transform: 'translateX(100%)' }),
                animate('250ms ease-out', style({ transform: 'translateX(0)' }))
            ]),
            transition(':leave', [
                animate('200ms ease-in', style({ transform: 'translateX(100%)' }))
            ])
        ]),
        trigger('fadeIn', [
            transition(':enter', [
                style({ opacity: 0 }),
                animate('200ms ease-out', style({ opacity: 1 }))
            ]),
            transition(':leave', [
                animate('150ms ease-in', style({ opacity: 0 }))
            ])
        ])
    ]
})
export class QueryInfoPanelComponent implements OnInit, OnDestroy {
    // ========================================
    // Inputs
    // ========================================

    @Input() QueryInfo: QueryInfo | null = null;
    @Input() Visible: boolean = false;
    @Input() ShowOverlay: boolean = true;

    // ========================================
    // Outputs
    // ========================================

    @Output() Close = new EventEmitter<void>();
    @Output() OpenRecord = new EventEmitter<OpenQueryRecordEvent>();

    // ========================================
    // Internal State
    // ========================================

    public PanelWidth: number = 450;
    public ExpandedSections: Set<string> = new Set(['overview', 'fields']);

    private isResizing: boolean = false;
    private destroy$ = new Subject<void>();
    private widthPersistSubject = new Subject<number>();

    constructor(private cdr: ChangeDetectorRef) {
        // Debounce width persistence
        this.widthPersistSubject.pipe(
            debounceTime(500),
            takeUntil(this.destroy$)
        ).subscribe(width => {
            this.persistPanelWidth(width);
        });
    }

    ngOnInit(): void {
        this.loadPanelWidth();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ========================================
    // Section Toggle
    // ========================================

    public ToggleSection(section: string): void {
        if (this.ExpandedSections.has(section)) {
            this.ExpandedSections.delete(section);
        } else {
            this.ExpandedSections.add(section);
        }
        this.cdr.markForCheck();
    }

    public IsSectionExpanded(section: string): boolean {
        return this.ExpandedSections.has(section);
    }

    // ========================================
    // Panel Actions
    // ========================================

    public OnClose(): void {
        this.Close.emit();
    }

    public OnOpenRecord(): void {
        if (this.QueryInfo) {
            this.OpenRecord.emit({
                queryId: this.QueryInfo.ID,
                queryName: this.QueryInfo.Name
            });
        }
    }

    // ========================================
    // Resize Handling
    // ========================================

    public OnResizeStart(event: MouseEvent): void {
        event.preventDefault();
        this.isResizing = true;
    }

    @HostListener('document:mousemove', ['$event'])
    OnMouseMove(event: MouseEvent): void {
        if (!this.isResizing) return;

        const newWidth = window.innerWidth - event.clientX;
        this.PanelWidth = Math.min(Math.max(newWidth, 350), 800);
        this.widthPersistSubject.next(this.PanelWidth);
        this.cdr.markForCheck();
    }

    @HostListener('document:mouseup')
    OnMouseUp(): void {
        this.isResizing = false;
    }

    // ========================================
    // Width Persistence
    // ========================================

    private loadPanelWidth(): void {
        try {
            const saved = UserInfoEngine.Instance.GetSetting(INFO_PANEL_WIDTH_KEY);
            if (saved) {
                this.PanelWidth = parseInt(saved, 10) || 450;
            }
        } catch (error) {
            console.warn('[query-info-panel] Failed to load panel width:', error);
        }
    }

    private async persistPanelWidth(width: number): Promise<void> {
        try {
            await UserInfoEngine.Instance.SetSetting(INFO_PANEL_WIDTH_KEY, String(width));
        } catch (error) {
            console.warn('[query-info-panel] Failed to persist panel width:', error);
        }
    }

    // ========================================
    // Helpers
    // ========================================

    public GetFieldTypeDisplay(field: QueryFieldInfo): string {
        return field.SQLFullType || field.SQLBaseType || 'unknown';
    }

    public GetParamTypeDisplay(param: QueryParameterInfo): string {
        return param.Type || 'string';
    }

    public TrackByField(index: number, field: QueryFieldInfo): string {
        return field.Name;
    }

    public TrackByParam(index: number, param: QueryParameterInfo): string {
        return param.Name;
    }
}
