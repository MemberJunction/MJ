import { Component, Input, OnChanges, SimpleChanges, ChangeDetectorRef, AfterContentInit, ContentChildren, QueryList, HostBinding, OnInit, Output, EventEmitter, HostListener, ElementRef } from '@angular/core';
import { MJFormField } from './base-field-component';
import { BaseFormContext } from './base-form-context';

/** Event emitted when a panel drag operation starts */
export interface PanelDragStartEvent {
    sectionKey: string;
    event: DragEvent;
}

/** Event emitted when a panel is dropped */
export interface PanelDropEvent {
    sourceSectionKey: string;
    targetSectionKey: string;
}

/**
 * Reusable collapsible panel component for form sections
 * Handles:
 * - Expand/collapse state
 * - Search filtering with case-insensitive matching
 * - Yellow highlighting of matched section names
 * - Visibility management based on section name or field name matches
 * - Passes sectionFilter down to child mj-form-field components for their own label highlighting
 */
@Component({
  standalone: false,
    selector: 'mj-collapsible-panel',
    template: `
        <div
            class="form-card collapsible-card"
            [class.related-entity]="variant === 'related-entity'"
            [attr.data-section-name]="sectionName"
            [attr.data-field-names]="fieldNames"
            [attr.data-section-key]="sectionKey">
            <div class="collapsible-header" role="button" tabindex="0" (click)="toggle()">
                <div class="drag-handle"
                     title="Drag to reorder sections"
                     draggable="true"
                     (dragstart)="onDragStart($event)"
                     (dragend)="onDragEnd($event)"
                     (click)="$event.stopPropagation()">
                    <i class="fa-solid fa-grip-vertical"></i>
                </div>
                <div class="collapsible-title">
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
                <div class="collapse-icon">
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

        .form-card {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            transition: all 0.3s ease;
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
            cursor: pointer;
        }

        .drag-handle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 0;
            height: 24px;
            color: #9ca3af;
            cursor: grab;
            opacity: 0;
            overflow: hidden;
            transition: width 0.2s ease, opacity 0.2s ease, color 0.2s ease;
            flex-shrink: 0;
        }

        .collapsible-header:hover .drag-handle {
            width: 24px;
            opacity: 1;
        }

        .drag-handle:hover {
            color: #667eea;
        }

        .drag-handle:active {
            cursor: grabbing;
        }

        :host(.dragging) .drag-handle {
            width: 24px;
            opacity: 1;
            color: #667eea;
        }

        :host(.drag-over) {
            border: 2px dashed #667eea;
            border-radius: 8px;
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

        .collapsible-header .collapse-icon {
            color: #6b7280;
            transition: transform 0.3s ease;
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
    @Input() form: unknown; // Reference to the form component for method calls
    @Input() formContext?: BaseFormContext; // Contains all form-level state
    @Input() variant: 'default' | 'related-entity' = 'default';
    @Input() badgeCount: number | undefined;
    @Input() entityName: string = ''; // For display/reference purposes
    @Input() defaultExpanded: boolean | undefined; // Default expanded state when no persisted state exists

    @Output() dragStarted = new EventEmitter<PanelDragStartEvent>();
    @Output() dragEnded = new EventEmitter<void>();
    @Output() panelDrop = new EventEmitter<PanelDropEvent>();

    @ContentChildren(MJFormField, { descendants: true }) fieldComponents!: QueryList<MJFormField>;

    @HostBinding('class.search-hidden')
    get isHidden(): boolean {
        return !this.isVisible;
    }

    @HostBinding('style.order')
    get cssOrder(): number {
        const formRef = this.form as { getSectionDisplayOrder?: (key: string) => number };
        return formRef?.getSectionDisplayOrder ? formRef.getSectionDisplayOrder(this.sectionKey) : 0;
    }

    @HostBinding('class.dragging')
    isDragging = false;

    @HostBinding('class.drag-over')
    isDragOver = false;

    constructor(private cdr: ChangeDetectorRef, private elementRef: ElementRef) {}

    @HostListener('dragover', ['$event'])
    onDragOver(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        // Check if this is a panel drag (not a file drag)
        if (event.dataTransfer?.types.includes('text/plain')) {
            this.isDragOver = true;
        }
    }

    @HostListener('dragleave', ['$event'])
    onDragLeave(event: DragEvent): void {
        event.preventDefault();
        this.isDragOver = false;
    }

    @HostListener('drop', ['$event'])
    onDrop(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragOver = false;

        const sourceSectionKey = event.dataTransfer?.getData('text/plain');
        if (sourceSectionKey && sourceSectionKey !== this.sectionKey) {
            this.panelDrop.emit({
                sourceSectionKey,
                targetSectionKey: this.sectionKey
            });

            // Reorder sections via the form component
            this.reorderSections(sourceSectionKey, this.sectionKey);
        }
    }

    /**
     * Reorders sections by moving the source section to the position of the target section.
     */
    private reorderSections(sourceSectionKey: string, targetSectionKey: string): void {
        const formRef = this.form as {
            getSectionOrder?: () => string[];
            setSectionOrder?: (order: string[]) => void;
        };

        if (!formRef?.getSectionOrder || !formRef?.setSectionOrder) {
            return;
        }

        const currentOrder = formRef.getSectionOrder();
        const sourceIndex = currentOrder.indexOf(sourceSectionKey);
        const targetIndex = currentOrder.indexOf(targetSectionKey);

        if (sourceIndex === -1 || targetIndex === -1) {
            return;
        }

        // Remove source from current position
        const newOrder = [...currentOrder];
        newOrder.splice(sourceIndex, 1);

        // Insert at target position
        newOrder.splice(targetIndex, 0, sourceSectionKey);

        // Save the new order
        formRef.setSectionOrder(newOrder);
        this.cdr.markForCheck();
    }

    onDragStart(event: DragEvent): void {
        this.isDragging = true;
        event.dataTransfer?.setData('text/plain', this.sectionKey);
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
        }
        this.dragStarted.emit({ sectionKey: this.sectionKey, event });
    }

    onDragEnd(event: DragEvent): void {
        this.isDragging = false;
        this.dragEnded.emit();
    }

    get expanded(): boolean {
        const formRef = this.form as { IsSectionExpanded?: (key: string, defaultExpanded?: boolean) => boolean };
        return formRef?.IsSectionExpanded ? formRef.IsSectionExpanded(this.sectionKey, this.defaultExpanded) : true;
    }

    displayName: string = '';
    fieldNames: string = '';
    isVisible: boolean = true;

    ngOnInit(): void {
        // Initialize display name
        this.displayName = this.sectionName;
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
        const formRef = this.form as { SetSectionExpanded?: (key: string, expanded: boolean) => void };
        if (formRef?.SetSectionExpanded) {
            formRef.SetSectionExpanded(this.sectionKey, !this.expanded);
            this.cdr.markForCheck();
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
