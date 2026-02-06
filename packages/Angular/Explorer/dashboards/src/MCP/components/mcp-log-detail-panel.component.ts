/**
 * @fileoverview MCP Log Detail Slide-Out Panel Component
 *
 * Displays detailed information about an MCP tool execution log
 * in a slide-out panel from the right side.
 */

import { Component, Input, Output, EventEmitter, ChangeDetectorRef, HostListener, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { trigger, transition, style, animate } from '@angular/animations';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { MCPExecutionLogData } from '../mcp-dashboard.component';

/**
 * Extended log data with parsed input/output
 */
export interface LogDetailData extends MCPExecutionLogData {
    InputArgs?: string | null;
    Result?: string | null;
    ServerName?: string;
}

/**
 * Expandable section state
 */
interface ExpandableSection {
    expanded: boolean;
}

@Component({
  standalone: false,
    selector: 'mj-mcp-log-detail-panel',
    templateUrl: './mcp-log-detail-panel.component.html',
    styleUrls: ['./mcp-log-detail-panel.component.css'],
    animations: [
        trigger('slideIn', [
            transition(':enter', [
                style({ transform: 'translateX(100%)', opacity: 0 }),
                animate('250ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
            ]),
            transition(':leave', [
                animate('200ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
            ])
        ])
    ]
})
export class MCPLogDetailPanelComponent implements OnInit, OnDestroy {

    // ========================================
    // Inputs
    // ========================================

    @Input() Visible = false;
    @Input() Log: LogDetailData | null = null;

    // ========================================
    // Outputs
    // ========================================

    @Output() Close = new EventEmitter<void>();
    @Output() RunAgain = new EventEmitter<{ toolId: string; connectionId: string }>();

    // ========================================
    // Expandable Sections State
    // ========================================

    InputArgsSection: ExpandableSection = { expanded: true };
    ResultSection: ExpandableSection = { expanded: true };
    ErrorSection: ExpandableSection = { expanded: true };

    // ========================================
    // Panel Width / Resize State
    // ========================================

    private readonly PANEL_WIDTH_SETTING_KEY = 'mcp-log-detail-panel/width';
    private readonly MIN_PANEL_WIDTH = 320;
    private readonly MAX_PANEL_WIDTH = 800;
    private readonly DEFAULT_PANEL_WIDTH = 500;
    private readonly MOBILE_BREAKPOINT = 768;

    PanelWidth: number = this.DEFAULT_PANEL_WIDTH;
    IsResizing = false;

    get IsMobileMode(): boolean {
        return typeof window !== 'undefined' && window.innerWidth <= this.MOBILE_BREAKPOINT;
    }

    private widthPersistSubject = new Subject<number>();
    private destroy$ = new Subject<void>();

    constructor(private cdr: ChangeDetectorRef) {
        this.widthPersistSubject.pipe(
            debounceTime(500),
            takeUntil(this.destroy$)
        ).subscribe(width => {
            this.persistPanelWidth(width);
        });
    }

    ngOnInit(): void {
        this.loadSavedPanelWidth();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ========================================
    // Panel Resize Handlers
    // ========================================

    onResizeStart(event: MouseEvent): void {
        if (this.IsMobileMode) return;
        event.preventDefault();
        this.IsResizing = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }

    @HostListener('document:mousemove', ['$event'])
    onMouseMove(event: MouseEvent): void {
        if (!this.IsResizing) return;
        const newWidth = window.innerWidth - event.clientX;
        this.PanelWidth = Math.min(
            Math.max(newWidth, this.MIN_PANEL_WIDTH),
            Math.min(this.MAX_PANEL_WIDTH, window.innerWidth - 50)
        );
        this.cdr.detectChanges();
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

    @HostListener('window:resize')
    onWindowResize(): void {
        if (this.IsMobileMode) {
            this.PanelWidth = window.innerWidth;
        } else if (this.PanelWidth > window.innerWidth - 50) {
            this.PanelWidth = Math.max(this.MIN_PANEL_WIDTH, window.innerWidth - 50);
        }
        this.cdr.detectChanges();
    }

    private loadSavedPanelWidth(): void {
        if (this.IsMobileMode) {
            this.PanelWidth = window.innerWidth;
            return;
        }
        try {
            const savedWidth = UserInfoEngine.Instance.GetSetting(this.PANEL_WIDTH_SETTING_KEY);
            if (savedWidth) {
                const width = parseInt(savedWidth, 10);
                if (!isNaN(width) && width >= this.MIN_PANEL_WIDTH && width <= this.MAX_PANEL_WIDTH) {
                    this.PanelWidth = width;
                }
            }
        } catch (error) {
            console.warn('[MCPLogDetailPanel] Failed to load saved panel width:', error);
        }
    }

    private async persistPanelWidth(width: number): Promise<void> {
        try {
            await UserInfoEngine.Instance.SetSetting(this.PANEL_WIDTH_SETTING_KEY, String(width));
        } catch (error) {
            console.warn('[MCPLogDetailPanel] Failed to persist panel width:', error);
        }
    }

    // ========================================
    // Actions
    // ========================================

    closePanel(): void {
        this.Close.emit();
    }

    onRunAgain(): void {
        if (this.Log?.ToolID && this.Log?.ConnectionID) {
            this.RunAgain.emit({
                toolId: this.Log.ToolID,
                connectionId: this.Log.ConnectionID
            });
        }
    }

    // ========================================
    // Section Toggle & Copy Actions
    // ========================================

    toggleSection(section: ExpandableSection): void {
        section.expanded = !section.expanded;
        this.cdr.detectChanges();
    }

    async copyInputArgs(): Promise<void> {
        await this.copyToClipboard(this.FormattedInputArgs, 'Input arguments copied to clipboard');
    }

    async copyResult(): Promise<void> {
        await this.copyToClipboard(this.FormattedResult, 'Result copied to clipboard');
    }

    async copyError(): Promise<void> {
        await this.copyToClipboard(this.Log?.ErrorMessage || '', 'Error message copied to clipboard');
    }

    private async copyToClipboard(text: string, successMessage: string): Promise<void> {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            // Could emit an event or show a toast here
            console.log(successMessage);
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
        }
    }

    // ========================================
    // Formatting Helpers
    // ========================================

    formatDate(date: Date | string | null): string {
        if (!date) return 'N/A';
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleString();
    }

    formatDuration(ms: number | null): string {
        if (ms === null) return '-';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    }

    formatJson(jsonString: string | null | undefined): string {
        if (!jsonString) return '';
        try {
            const parsed = JSON.parse(jsonString);
            return JSON.stringify(parsed, null, 2);
        } catch {
            return jsonString;
        }
    }

    get FormattedInputArgs(): string {
        return this.formatJson(this.Log?.InputArgs);
    }

    get FormattedResult(): string {
        return this.formatJson(this.Log?.Result);
    }

    getStatusIcon(status: string): string {
        switch (status) {
            case 'Success': return 'fa-solid fa-check-circle';
            case 'Error': return 'fa-solid fa-times-circle';
            case 'Running': return 'fa-solid fa-spinner fa-spin';
            default: return 'fa-solid fa-question-circle';
        }
    }

    getStatusClass(status: string): string {
        switch (status) {
            case 'Success': return 'status-success';
            case 'Error': return 'status-error';
            case 'Running': return 'status-running';
            default: return 'status-unknown';
        }
    }
}

/**
 * Tree-shaking prevention function
 */
export function LoadMCPLogDetailPanel(): void {
    // Ensures the component is not tree-shaken
}
