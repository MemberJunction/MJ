import { AfterViewChecked, ChangeDetectorRef, Component, Input, ViewEncapsulation } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

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
                        (expandAll)="formComponent.expandAllSections()"
                        (collapseAll)="formComponent.collapseAllSections()"
                        (filterChange)="onFilterChange($event)"
                        (showEmptyFieldsChange)="formComponent.showEmptyFields = $event">
                    </mj-form-section-controls>
                </mj-form-toolbar>

                <div class="forms-panel-container-outer">
                    <div class="form-panels-container">
                        <div class="related-entity-grid">
                            <ng-content select="[slot='before-panels']"></ng-content>
                        </div>
                        <ng-content select="[slot='field-panels']"></ng-content>
                        <div class="related-entities-divider"></div>
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
    @Input() record: any;
    @Input() formComponent!: BaseFormComponent;

    // Cached counts to avoid ExpressionChangedAfterItHasBeenCheckedError
    visibleCount = 0;
    totalCount = 0;
    expandedCount = 0;

    private countsInitialized = false;

    constructor(private cdr: ChangeDetectorRef) {}

    ngAfterViewChecked(): void {
        // Only update counts once after initial render to avoid the error
        // Subsequent updates happen through onFilterChange
        if (!this.countsInitialized && this.formComponent) {
            const newTotal = this.formComponent.getTotalSectionCount();
            if (newTotal > 0) {
                this.countsInitialized = true;
                this.updateCounts();
                this.cdr.detectChanges();
            }
        }
    }

    onFilterChange(filter: string): void {
        this.formComponent.onFilterChange(filter);
        // Update counts after filter change
        this.updateCounts();
    }

    private updateCounts(): void {
        if (this.formComponent) {
            this.visibleCount = this.formComponent.getVisibleSectionCount();
            this.totalCount = this.formComponent.getTotalSectionCount();
            this.expandedCount = this.formComponent.getExpandedCount();
        }
    }
}
