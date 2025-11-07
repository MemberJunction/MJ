import { Component, Input, ViewEncapsulation } from '@angular/core';
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
                        [expandedCount]="formComponent.getExpandedCount()"
                        [visibleCount]="formComponent.getVisibleSectionCount()"
                        (expandAll)="formComponent.expandAllSections()"
                        (collapseAll)="formComponent.collapseAllSections()"
                        (filterChange)="formComponent.onFilterChange($event)">
                    </mj-form-section-controls>
                </mj-form-toolbar>

                <div class="form-panels-container">
                    <div class="related-entity-grid">
                        <ng-content select="[slot='before-panels']"></ng-content>
                    </div>
                    <ng-content select="[slot='field-panels']"></ng-content>
                    <div class="related-entity-grid">
                        <ng-content select="[slot='after-panels']"></ng-content>
                    </div>
                </div>
            </form>
        </div>
    `,
    styleUrls: ['./record-form-container.component.css']
})
export class RecordFormContainerComponent {
    @Input() record: any;
    @Input() formComponent!: BaseFormComponent;
}
