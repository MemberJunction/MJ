import { AfterViewChecked, ChangeDetectorRef, Component, Input, ViewEncapsulation } from '@angular/core';
import { BaseFormComponent, FormWidthMode } from '@memberjunction/ng-base-forms';

/**
 * Container component that wraps generated forms with consistent structure and styling.
 * Encapsulates the entire form structure including toolbar, section controls, and panels container.
 *
 * Supports three content projection slots:
 * - [slot="before-panels"]: Related entity sections displayed before field panels
 * - [slot="field-panels"]: Main form field sections
 * - [slot="after-panels"]: Related entity sections displayed after field panels
 */
@Component({
    standalone: false,
    selector: 'mj-record-form-container',
    encapsulation: ViewEncapsulation.None,
    template: `
        <div class="record-form-container">
            <form *ngIf="record" class="record-form" #formElement="ngForm">
                <mj-form-toolbar [form]="formComponent">
                    <mj-form-section-controls
                        toolbar-additional-controls
                        [visibleCount]="visibleCount"
                        [totalCount]="totalCount"
                        [expandedCount]="expandedCount"
                        [searchFilter]="formComponent.searchFilter"
                        [showEmptyFields]="formComponent.showEmptyFields"
                        [widthMode]="widthMode"
                        [hasCustomOrder]="hasCustomOrder"
                        (expandAll)="onExpandAll()"
                        (collapseAll)="onCollapseAll()"
                        (filterChange)="onFilterChange($event)"
                        (showEmptyFieldsChange)="formComponent.showEmptyFields = $event"
                        (widthModeChange)="onWidthModeChange($event)"
                        (resetOrder)="onResetOrder()">
                    </mj-form-section-controls>
                </mj-form-toolbar>

                <div class="forms-panel-container-outer">
                    <div class="form-panels-container" [class.full-width]="widthMode === 'full-width'">
                        <div class="related-entity-grid">
                            <ng-content select="[slot='before-panels']"></ng-content>
                        </div>
                        <ng-content select="[slot='field-panels']"></ng-content>
                        <div class="related-entity-grid">
                            <ng-content select="[slot='after-panels']"></ng-content>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    `,
    styleUrls: ['./record-form-container.component.css']
})
export class RecordFormContainerComponent implements AfterViewChecked {
    @Input() record: unknown;
    @Input() formComponent!: BaseFormComponent;

    // Cached counts to avoid ExpressionChangedAfterItHasBeenCheckedError
    visibleCount = 0;
    totalCount = 0;
    expandedCount = 0;
    widthMode: FormWidthMode = 'centered';

    private countsInitialized = false;

    /** Returns true if user has customized the section order */
    get hasCustomOrder(): boolean {
        return this.formComponent?.hasCustomSectionOrder() ?? false;
    }

    constructor(private cdr: ChangeDetectorRef) {}

    ngAfterViewChecked(): void {
        // Only update counts once after initial render to avoid the error
        // Subsequent updates happen through onFilterChange
        if (!this.countsInitialized && this.formComponent) {
            const newTotal = this.formComponent.getTotalSectionCount();
            if (newTotal > 0) {
                this.countsInitialized = true;
                this.updateCounts();
                // Also load persisted width mode
                this.widthMode = this.formComponent.getFormWidthMode();
                this.cdr.detectChanges();
            }
        }
    }

    onFilterChange(filter: string): void {
        this.formComponent.onFilterChange(filter);
        // Update counts after filter change
        this.updateCounts();
    }

    onExpandAll(): void {
        this.formComponent.expandAllSections();
        this.updateCounts();
    }

    onCollapseAll(): void {
        this.formComponent.collapseAllSections();
        this.updateCounts();
    }

    onWidthModeChange(mode: FormWidthMode): void {
        this.widthMode = mode;
        this.formComponent.setFormWidthMode(mode);
    }

    onResetOrder(): void {
        this.formComponent.resetSectionOrder();
        this.cdr.detectChanges();
    }

    private updateCounts(): void {
        if (this.formComponent) {
            this.visibleCount = this.formComponent.getVisibleSectionCount();
            this.totalCount = this.formComponent.getTotalSectionCount();
            this.expandedCount = this.formComponent.getExpandedCount();
        }
    }
}
