import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';

/** Form width mode - 'centered' uses max-width constraint, 'full-width' uses all available space */
export type FormWidthMode = 'centered' | 'full-width';

/**
 * Reusable component for form section controls (Expand All, Collapse All, Filter, Counter, Width Toggle)
 * Designed to be projected into form toolbars via ng-content with [toolbar-additional-controls] selector
 */
@Component({
    selector: 'mj-form-section-controls[toolbar-additional-controls]',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <button kendoButton
                (click)="expandAll.emit()"
                [disabled]="allExpanded"
                title="Expand all sections">
            <span class="fa-solid fa-angle-double-down"></span>
        </button>
        <button kendoButton
                (click)="collapseAll.emit()"
                [disabled]="allCollapsed"
                title="Collapse all sections">
            <span class="fa-solid fa-angle-double-up"></span>
        </button>
        <button kendoButton
                (click)="toggleWidthMode()"
                [class.active]="widthMode === 'full-width'"
                [title]="widthMode === 'full-width' ? 'Switch to centered layout' : 'Expand form to full width'">
            <span class="fa-solid fa-left-right"></span>
        </button>
        @if (hasCustomOrder) {
            <div class="custom-order-indicator"
                 title="Sections are in a custom order">
                <span class="fa-solid fa-shuffle"></span>
                <span class="indicator-label">Custom Order</span>
                <button type="button"
                        class="reset-order-btn"
                        (click)="confirmResetOrder()"
                        title="Reset to default order">
                    <span class="fa-solid fa-xmark"></span>
                </button>
            </div>
        }
        <label class="show-empty-fields-toggle">
            <input
                type="checkbox"
                [(ngModel)]="showEmptyFields"
                (ngModelChange)="showEmptyFieldsChange.emit($event)">
            <span>Show Empty Fields</span>
        </label>
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

        <!-- Custom confirm dialog for reset order -->
        @if (showResetConfirmDialog) {
            <div class="dialog-overlay" (click)="cancelResetOrder()">
                <div class="confirm-dialog" (click)="$event.stopPropagation()">
                    <div class="dialog-header">
                        <span class="fa-solid fa-shuffle dialog-icon"></span>
                        <h3>Reset Section Order</h3>
                    </div>
                    <div class="dialog-body">
                        <p>Are you sure you want to reset the section order to default?</p>
                        <p class="dialog-hint">This will remove your custom arrangement.</p>
                    </div>
                    <div class="dialog-actions">
                        <button type="button" class="dialog-btn dialog-btn-primary" (click)="doResetOrder()">
                            <span class="fa-solid fa-check"></span>
                            Reset Order
                        </button>
                        <button type="button" class="dialog-btn dialog-btn-secondary" (click)="cancelResetOrder()">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        }
    `,
    styles: [`
        /* Note: positioning (display, gap, align-items, margin-left) is handled by parent toolbar CSS */

        button {
            padding: 6px 12px;
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
            justify-content: center;
            gap: 6px;
            font-weight: 500;
            height: 36px;
            box-sizing: border-box;
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

        button.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }

        button i {
            margin-right: 0;
            font-size: 14px;
        }

        .section-search {
            padding: 6px 14px;
            font-size: 13px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            width: 240px;
            transition: all 0.2s;
            background: white;
            height: 36px;
            box-sizing: border-box;
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

        .show-empty-fields-toggle {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            background: white;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 13px;
            font-weight: 500;
            color: #374151;
            user-select: none;
            height: 36px;
            box-sizing: border-box;
        }

        .show-empty-fields-toggle:hover {
            background: #f3f4f6;
            border-color: #9ca3af;
        }

        .show-empty-fields-toggle input[type="checkbox"] {
            cursor: pointer;
            width: 16px;
            height: 16px;
        }

        .show-empty-fields-toggle span {
            white-space: nowrap;
        }

        .custom-order-indicator {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px 6px 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
            height: 36px;
            box-sizing: border-box;
        }

        .custom-order-indicator .indicator-label {
            white-space: nowrap;
        }

        .custom-order-indicator .reset-order-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            padding: 0;
            margin-left: 4px;
            background: rgba(255, 255, 255, 0.2);
            border: none;
            border-radius: 50%;
            color: white;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 10px;
        }

        .custom-order-indicator .reset-order-btn:hover {
            background: rgba(255, 255, 255, 0.4);
            transform: scale(1.1);
        }

        .custom-order-indicator .reset-order-btn:active {
            transform: scale(0.95);
        }

        /* Custom confirm dialog styles */
        .dialog-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.15s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: scale(0.95) translateY(-10px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        .confirm-dialog {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            width: 380px;
            max-width: 90vw;
            overflow: hidden;
            animation: slideIn 0.2s ease;
        }

        .dialog-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 20px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }

        .dialog-header .dialog-icon {
            font-size: 20px;
        }

        .dialog-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
        }

        .dialog-body {
            padding: 24px;
        }

        .dialog-body p {
            margin: 0 0 8px 0;
            font-size: 15px;
            color: #374151;
            line-height: 1.5;
        }

        .dialog-body .dialog-hint {
            font-size: 13px;
            color: #6b7280;
            margin-bottom: 0;
        }

        .dialog-actions {
            display: flex;
            gap: 12px;
            padding: 16px 24px 24px;
        }

        .dialog-btn {
            flex: 1;
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .dialog-btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
        }

        .dialog-btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .dialog-btn-secondary {
            background: white;
            color: #374151;
            border: 1px solid #d1d5db;
        }

        .dialog-btn-secondary:hover {
            background: #f3f4f6;
            border-color: #9ca3af;
        }
    `]
})
export class FormSectionControlsComponent {
    @Input() visibleCount: number = 0;
    @Input() totalCount: number = 0;
    @Input() searchFilter: string = '';
    @Input() expandedCount: number = 0;
    @Input() showEmptyFields: boolean = false;
    @Input() widthMode: FormWidthMode = 'centered';
    @Input() hasCustomOrder: boolean = false;
    @Output() expandAll = new EventEmitter<void>();
    @Output() collapseAll = new EventEmitter<void>();
    @Output() filterChange = new EventEmitter<string>();
    @Output() showEmptyFieldsChange = new EventEmitter<boolean>();
    @Output() widthModeChange = new EventEmitter<FormWidthMode>();
    @Output() resetOrder = new EventEmitter<void>();

    searchTerm = '';
    showResetConfirmDialog = false;

    get allExpanded(): boolean {
        return this.totalCount > 0 && this.expandedCount === this.totalCount;
    }

    get allCollapsed(): boolean {
        return this.totalCount > 0 && this.expandedCount === 0;
    }

    clearFilter(): void {
        this.searchTerm = '';
        this.filterChange.emit('');
    }

    toggleWidthMode(): void {
        const newMode: FormWidthMode = this.widthMode === 'centered' ? 'full-width' : 'centered';
        this.widthModeChange.emit(newMode);
    }

    confirmResetOrder(): void {
        this.showResetConfirmDialog = true;
    }

    doResetOrder(): void {
        this.showResetConfirmDialog = false;
        this.resetOrder.emit();
    }

    cancelResetOrder(): void {
        this.showResetConfirmDialog = false;
    }
}
