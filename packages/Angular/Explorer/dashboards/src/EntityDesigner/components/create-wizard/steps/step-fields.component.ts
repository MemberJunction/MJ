/**
 * @module step-fields.component
 * @description Step 2 wrapper — hosts EntityFieldsGridComponent in create mode.
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import type { ColumnSpec } from '../../../entity-designer.types.js';

@Component({
    standalone: false,
    selector: 'mj-entity-step-fields',
    template: `
        <div class="step-fields-wrap">
            <mj-entity-fields-grid
                [Columns]="InitialColumns"
                Mode="create"
                (ColumnsChanged)="ColumnsChanged.emit($event)">
            </mj-entity-fields-grid>
        </div>
    `,
    styles: [`.step-fields-wrap { height: 100%; display: flex; flex-direction: column; }`],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepFieldsComponent {
    @Input() public InitialColumns: ColumnSpec[] = [];
    @Output() public readonly ColumnsChanged = new EventEmitter<ColumnSpec[]>();
}
