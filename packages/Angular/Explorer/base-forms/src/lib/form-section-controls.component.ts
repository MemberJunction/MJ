import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';

/**
 * Reusable component for form section controls (Expand All, Collapse All, Filter, Counter)
 * Designed to be projected into form toolbars via ng-content with [toolbar-additional-controls] selector
 */
@Component({
    selector: 'mj-form-section-controls[toolbar-additional-controls]',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <button kendoButton (click)="expandAll.emit()" title="Expand all sections">
            <span class="fa-solid fa-angle-double-down"></span>
        </button>
        <button kendoButton (click)="collapseAll.emit()" title="Collapse all sections">
            <span class="fa-solid fa-angle-double-up"></span>
        </button>
        <div style="position: relative;">
            <input
                type="text"
                class="section-search"
                placeholder="Filter sections..."
                [(ngModel)]="searchTerm"
                (ngModelChange)="filterChange.emit($event)"
                #searchInput>
            @if (searchTerm) {
                <button
                    kendoButton
                    class="clear-search-btn"
                    (click)="clearFilter()"
                    title="Clear filter">
                    <span class="fa-solid fa-xmark"></span>
                </button>
            }
        </div>
        @if (searchFilter && searchFilter.trim()) {
            <span class="section-count">{{visibleCount}}/{{totalCount}}</span>
        }
    `,
    styles: [`
        /* Note: positioning (display, gap, align-items, margin-left) is handled by parent toolbar CSS */

        button {
            padding: 8px 14px;
            font-size: 13px;
            border: 1px solid #d1d5db;
            background: white;
            color: #374151;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            margin-right: 0;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-weight: 500;
        }

        button:hover {
            background: #667eea;
            color: white;
            border-color: #667eea;
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(102, 126, 234, 0.2);
        }

        button:active {
            transform: translateY(0);
        }

        button i {
            margin-right: 0;
            font-size: 14px;
        }

        .section-search {
            padding: 8px 14px;
            font-size: 13px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            width: 240px;
            transition: all 0.2s;
            background: white;
        }

        .section-search:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .section-search::placeholder {
            color: #9ca3af;
            font-style: italic;
        }

        .section-count {
            font-size: 13px;
            color: #6b7280;
            font-weight: 500;
            padding: 6px 12px;
            background: #f3f4f6;
            border-radius: 6px;
        }

        .clear-search-btn {
            position: absolute;
            right: 6px;
            top: 50%;
            transform: translateY(-50%);
            padding: 4px 8px;
            min-width: unset;
        }
    `]
})
export class FormSectionControlsComponent {
    @Input() visibleCount: number = 0;
    @Input() totalCount: number = 0;
    @Input() searchFilter: string = '';
    @Output() expandAll = new EventEmitter<void>();
    @Output() collapseAll = new EventEmitter<void>();
    @Output() filterChange = new EventEmitter<string>();

    searchTerm = '';

    clearFilter(): void {
        this.searchTerm = '';
        this.filterChange.emit('');
    }
}
