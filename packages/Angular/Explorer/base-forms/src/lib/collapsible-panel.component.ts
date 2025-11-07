import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef, AfterContentInit, ContentChildren, QueryList } from '@angular/core';
import { MJFormField } from './base-field-component';

/**
 * Reusable collapsible panel component for form sections
 * Handles:
 * - Expand/collapse state
 * - Search filtering with word-boundary matching
 * - Yellow highlighting of matched section names and field labels
 * - Visibility management
 * - Field name extraction for filtering
 */
@Component({
    selector: 'mj-collapsible-panel',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div
            class="form-card collapsible-card"
            [class.search-hidden]="!isVisible"
            [attr.data-section-name]="sectionName"
            [attr.data-field-names]="fieldNames">
            <div class="collapsible-header" (click)="toggle()" role="button" tabindex="0">
                <div class="collapsible-title">
                    <i [class]="icon"></i>
                    <h3><span class="section-name" [innerHTML]="displayName"></span></h3>
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

        .form-card {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }

        .collapsible-card {
            overflow: hidden;
        }

        .collapsible-card.search-hidden {
            display: none;
        }

        .collapsible-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 24px;
            background: linear-gradient(135deg, #f9fafb 0%, #ffffff 100%);
            border-bottom: 2px solid #e5e7eb;
            cursor: pointer;
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
        }

        /* Search highlighting */
        .collapsible-title h3 ::ng-deep .search-highlight {
            background-color: #fef08a;
            color: #854d0e;
            padding: 2px 4px;
            border-radius: 3px;
            font-weight: 700;
        }
    `]
})
export class CollapsiblePanelComponent implements OnChanges, AfterContentInit {
    @Input() sectionName: string = '';
    @Input() icon: string = 'fa fa-folder';
    @Input() expanded: boolean = true;
    @Input() searchFilter: string = '';
    @Output() expandedChange = new EventEmitter<boolean>();

    @ContentChildren(MJFormField, { descendants: true }) fieldComponents!: QueryList<MJFormField>;

    displayName: string = '';
    fieldNames: string = '';
    isVisible: boolean = true;
    private originalSectionName: string = '';

    constructor(
        private elementRef: ElementRef,
        private cdr: ChangeDetectorRef
    ) {}

    ngAfterContentInit(): void {
        // Extract field names from projected field components
        this.updateFieldNames();
        this.fieldComponents.changes.subscribe(() => {
            this.updateFieldNames();
        });
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['sectionName']) {
            this.originalSectionName = this.sectionName;
            this.displayName = this.sectionName;
        }

        if (changes['searchFilter'] || changes['sectionName']) {
            this.updateVisibilityAndHighlighting();
        }
    }

    toggle(): void {
        this.expanded = !this.expanded;
        this.expandedChange.emit(this.expanded);
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
        const searchTerm = this.searchFilter.toLowerCase().trim();

        if (!searchTerm) {
            // No filter - show everything, clear highlights
            this.isVisible = true;
            this.displayName = this.originalSectionName;
            this.clearFieldHighlights();
            this.cdr.markForCheck();
            return;
        }

        // Check if this section matches the filter
        const sectionMatches = this.sectionName.toLowerCase().includes(searchTerm);
        const fieldsMatch = this.fieldNames.includes(searchTerm);
        this.isVisible = sectionMatches || fieldsMatch;

        if (this.isVisible) {
            // Escape special regex characters
            const escapedTerm = this.escapeRegex(searchTerm);
            const wordBoundaryRegex = new RegExp('\\b' + escapedTerm + '\\b', 'gi');

            // Highlight section name if it matches
            if (this.sectionName.toLowerCase().match(wordBoundaryRegex)) {
                this.displayName = this.originalSectionName.replace(
                    wordBoundaryRegex,
                    '<mark class="search-highlight">$&</mark>'
                );
            } else {
                this.displayName = this.originalSectionName;
            }

            // Highlight field labels if they match
            if (fieldsMatch) {
                this.highlightFieldLabels(wordBoundaryRegex);
            } else {
                this.clearFieldHighlights();
            }
        }

        this.cdr.markForCheck();
    }

    private highlightFieldLabels(regex: RegExp): void {
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
            const panel = this.elementRef.nativeElement.querySelector('.form-card');
            if (panel) {
                const labels = panel.querySelectorAll('mj-form-field label');
                labels.forEach((label: Element) => {
                    const span = label.querySelector('span');
                    if (span) {
                        const labelText = span.textContent || '';
                        if (labelText.toLowerCase().match(regex)) {
                            span.innerHTML = labelText.replace(regex, '<mark class="search-highlight">$&</mark>');
                        }
                    }
                });
            }
        }, 0);
    }

    private clearFieldHighlights(): void {
        setTimeout(() => {
            const panel = this.elementRef.nativeElement.querySelector('.form-card');
            if (panel) {
                const labels = panel.querySelectorAll('mj-form-field label span');
                labels.forEach((span: Element) => {
                    const htmlSpan = span as HTMLElement;
                    if (htmlSpan.innerHTML !== htmlSpan.textContent) {
                        htmlSpan.innerHTML = htmlSpan.textContent || '';
                    }
                });
            }
        }, 0);
    }

    private escapeRegex(term: string): string {
        // Escape special regex characters
        let escaped = term;
        escaped = escaped.replace(/\\/g, '\\\\');
        escaped = escaped.replace(/\./g, '\\.');
        escaped = escaped.replace(/\*/g, '\\*');
        escaped = escaped.replace(/\+/g, '\\+');
        escaped = escaped.replace(/\?/g, '\\?');
        escaped = escaped.replace(/\^/g, '\\^');
        escaped = escaped.replace(/\$/g, '\\$');
        escaped = escaped.replace(/\{/g, '\\{');
        escaped = escaped.replace(/\}/g, '\\}');
        escaped = escaped.replace(/\(/g, '\\(');
        escaped = escaped.replace(/\)/g, '\\)');
        escaped = escaped.replace(/\|/g, '\\|');
        escaped = escaped.replace(/\[/g, '\\[');
        escaped = escaped.replace(/\]/g, '\\]');
        return escaped;
    }
}
