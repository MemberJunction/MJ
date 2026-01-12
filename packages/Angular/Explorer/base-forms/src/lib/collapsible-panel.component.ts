import { Component, Input, OnChanges, SimpleChanges, ChangeDetectorRef, AfterContentInit, ContentChildren, QueryList, HostBinding, Output, EventEmitter, OnInit } from '@angular/core';
import { MJFormField } from './base-field-component';
import { BaseFormContext } from './base-form-context';

export type PanelWidthMode = 'normal' | 'full-width';

/**
 * Reusable collapsible panel component for form sections
 * Handles:
 * - Expand/collapse state
 * - Search filtering with case-insensitive matching
 * - Yellow highlighting of matched section names
 * - Visibility management based on section name or field name matches
 * - Passes sectionFilter down to child mj-form-field components for their own label highlighting
 * - Panel width modes: normal (default), full-width (spans entire row)
 */
@Component({
    selector: 'mj-collapsible-panel',
    template: `
        <div
            class="form-card collapsible-card"
            [class.related-entity]="variant === 'related-entity'"
            [attr.data-section-name]="sectionName"
            [attr.data-field-names]="fieldNames">
            <div class="collapsible-header" role="button" tabindex="0">
                <div class="collapsible-title" (click)="toggle()">
                    <i [class]="icon"></i>
                    <h3>
                        <span class="section-name" [innerHTML]="displayName"></span>
                        @if (badgeCount !== undefined) {
                            <span class="row-count-badge"
                                  [class.zero-rows]="badgeCount === 0">
                                {{badgeCount}}
                            </span>
                        }
                    </h3>
                </div>
                <div class="panel-width-controls">
                    <button
                        class="width-control-btn"
                        [class.active]="widthMode === 'full-width'"
                        (click)="toggleFullWidth($event)"
                        title="Stretch panel to full width"
                        aria-label="Stretch panel to full width"
                        type="button">
                        <i class="fa-solid fa-left-right"></i>
                    </button>
                </div>
                <div class="collapse-icon" (click)="toggle()">
                    <i [class]="expanded ? 'fa fa-chevron-up' : 'fa fa-chevron-down'"></i>
                </div>
            </div>
            <div class="collapsible-body" [class.collapsed]="!expanded">
                <div class="form-body">
                    <ng-content></ng-content>
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: block;
        }

        :host(.search-hidden) {
            display: none;
        }

        :host(.panel-full-width) {
            grid-column: 1 / -1 !important;
        }

        .form-card {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            transition: all 0.3s ease;
        }

        :host(.panel-full-width) .form-card {
            box-shadow: 0 4px 8px rgba(102, 126, 234, 0.15);
            border: 2px solid #667eea;
        }

        .collapsible-card {
            overflow: hidden;
        }

        .collapsible-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 20px 24px;
            background: linear-gradient(135deg, #f9fafb 0%, #ffffff 100%);
            border-bottom: 2px solid #e5e7eb;
            user-select: none;
            transition: all 0.3s ease;
        }

        .collapsible-header:hover {
            background: linear-gradient(135deg, #f3f4f6 0%, #f9fafb 100%);
            border-bottom-color: #667eea;
        }

        .collapsible-title {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
            cursor: pointer;
        }

        .collapsible-title i {
            font-size: 20px;
            color: #667eea;
        }

        .collapsible-title h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
        }

        .panel-width-controls {
            display: flex;
            gap: 6px;
            align-items: center;
        }

        .width-control-btn {
            padding: 6px 10px;
            font-size: 13px;
            border: 1px solid #d1d5db;
            background: white;
            color: #6b7280;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .width-control-btn:hover {
            background: #f3f4f6;
            color: #374151;
            border-color: #9ca3af;
        }

        .width-control-btn.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }

        .width-control-btn i {
            font-size: 12px;
        }

        .collapsible-header .collapse-icon {
            color: #6b7280;
            transition: transform 0.3s ease;
            cursor: pointer;
            padding: 4px;
        }

        .collapsible-body {
            max-height: 2000px;
            overflow: hidden;
            transition: max-height 0.4s ease, padding 0.4s ease, opacity 0.3s ease;
            opacity: 1;
        }

        .collapsible-body.collapsed {
            max-height: 0;
            padding: 0;
            opacity: 0;
        }

        .form-body {
            padding: 24px;
            overflow: auto;
            max-height: 600px;
        }

        /* Related Entity Sections - Visual Distinction */
        .form-card.related-entity {
            background: linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%);
            border-left: 3px solid #3b82f6;
        }

        /* Related entity sections contain grids that need more vertical space */
        .form-card.related-entity .form-body {
            max-height: none;
            min-height: 300px;
            height: 400px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        /* Ensure wrapper div and grid inside take full height */
        .form-card.related-entity .form-body > ::ng-deep div {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }

        .form-card.related-entity .form-body ::ng-deep mj-entity-data-grid,
        .form-card.related-entity .form-body ::ng-deep mj-explorer-entity-data-grid {
            flex: 1;
            display: block;
            min-height: 0;
        }

        .form-card.related-entity .collapsible-header {
            background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%);
        }

        .form-card.related-entity .collapsible-header:hover {
            background: linear-gradient(135deg, #bfdbfe 0%, #e0f2fe 100%);
            border-bottom-color: #3b82f6;
        }

        .form-card.related-entity .collapsible-title i {
            color: #3b82f6;
        }

        /* Row count badge for related entity sections */
        .collapsible-title .row-count-badge {
            background: #10b981;
            color: white;
            padding: 3px 8px 2px 9px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            margin-left: 8px;
            vertical-align: middle;
            position: relative;
            top: -2px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 24px;
            line-height: 1;
        }

        /* Gray badge for zero rows (loaded but empty) */
        .collapsible-title .row-count-badge.zero-rows {
            background: #9ca3af;
        }

        /* Search highlighting */
        .collapsible-title h3 ::ng-deep .search-highlight {
            background-color: #fef08a;
            color: #854d0e;
            padding: 0;
            border-radius: 2px;
            font-weight: 700;
            box-shadow: 0 0 0 2px #fef08a;
        }
    `]
})
export class CollapsiblePanelComponent implements OnChanges, AfterContentInit, OnInit {
    @Input() sectionKey: string = '';
    @Input() sectionName: string = '';
    @Input() icon: string = 'fa fa-folder';
    @Input() form: any; // Reference to the form component for method calls
    @Input() formContext?: BaseFormContext; // Contains all form-level state
    @Input() variant: 'default' | 'related-entity' = 'default';
    @Input() badgeCount: number | undefined;
    @Input() entityName: string = ''; // For display/reference purposes
    @Input() defaultExpanded: boolean | undefined; // Default expanded state when no persisted state exists

    @Output() widthModeChange = new EventEmitter<PanelWidthMode>();

    @ContentChildren(MJFormField, { descendants: true }) fieldComponents!: QueryList<MJFormField>;

    @HostBinding('class.search-hidden')
    get isHidden(): boolean {
        return !this.isVisible;
    }

    @HostBinding('class.panel-full-width')
    get isFullWidth(): boolean {
        return this.widthMode === 'full-width';
    }


    get expanded(): boolean {
        return this.form ? this.form.IsSectionExpanded(this.sectionKey, this.defaultExpanded) : true;
    }

    displayName: string = '';
    fieldNames: string = '';
    isVisible: boolean = true;
    widthMode: PanelWidthMode = 'normal';

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        // Load width mode from form's state service
        this.loadWidthMode();
    }

    ngAfterContentInit(): void {
        // Extract field names from projected field components
        this.updateFieldNames();
        this.fieldComponents.changes.subscribe(() => {
            this.updateFieldNames();
        });
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['sectionName']) {
            this.displayName = this.sectionName;
        }

        if (changes['sectionName'] || changes['formContext']) {
            this.updateVisibilityAndHighlighting();
        }

        // Update context on all child field components when it changes
        if (changes['formContext'] && this.fieldComponents) {
            this.fieldComponents.forEach(field => {
                field.formContext = this.formContext;
            });
        }
    }

    toggle(): void {
        if (this.form) {
            this.form.SetSectionExpanded(this.sectionKey, !this.expanded);
            this.cdr.markForCheck();
        }
    }

    toggleFullWidth(event: Event): void {
        event.stopPropagation();
        const newMode = this.widthMode === 'full-width' ? 'normal' : 'full-width';

        // Auto-expand panel when switching to full-width mode
        if (newMode === 'full-width' && !this.expanded && this.form) {
            this.form.SetSectionExpanded(this.sectionKey, true);
        }

        this.setWidthMode(newMode);
    }

    setWidthMode(mode: PanelWidthMode): void {
        this.widthMode = mode;
        this.saveWidthMode();
        this.widthModeChange.emit(mode);
        this.cdr.markForCheck();
    }

    private saveWidthMode(): void {
        // Delegate to form's state service for persistence
        if (this.form && typeof this.form.setSectionWidthMode === 'function') {
            this.form.setSectionWidthMode(this.sectionKey, this.widthMode);
        }
    }

    private loadWidthMode(): void {
        // Load from form's state service
        if (this.form && typeof this.form.getSectionWidthMode === 'function') {
            const saved = this.form.getSectionWidthMode(this.sectionKey);
            if (saved && (saved === 'normal' || saved === 'full-width')) {
                this.widthMode = saved;
                this.cdr.markForCheck();
            }
        }
    }

    private updateFieldNames(): void {
        if (this.fieldComponents) {
            // Extract field display names from all mj-form-field components
            const names: string[] = [];
            this.fieldComponents.forEach(field => {
                if (field.DisplayName) {
                    names.push(field.DisplayName.toLowerCase());
                }
            });
            this.fieldNames = names.join(' ');
            this.updateVisibilityAndHighlighting();
        }
    }

    private updateVisibilityAndHighlighting(): void {
        const searchTerm = (this.formContext?.sectionFilter || '').toLowerCase().trim();

        if (!searchTerm) {
            // No filter - show everything, clear highlights
            this.isVisible = true;
            this.displayName = this.sectionName;
            this.cdr.markForCheck();
            return;
        }

        // Check if this section matches the filter (section name or any field name)
        const sectionMatches = this.sectionName.toLowerCase().includes(searchTerm);
        const fieldsMatch = this.fieldNames.includes(searchTerm);
        this.isVisible = sectionMatches || fieldsMatch;

        if (this.isVisible && sectionMatches) {
            // Highlight section name if it matches
            const escapedTerm = this.escapeRegex(searchTerm);
            const regex = new RegExp(escapedTerm, 'gi');
            this.displayName = this.sectionName.replace(regex, '<mark class="search-highlight">$&</mark>');
        } else {
            this.displayName = this.sectionName;
        }

        this.cdr.markForCheck();
    }

    private escapeRegex(term: string): string {
        return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
