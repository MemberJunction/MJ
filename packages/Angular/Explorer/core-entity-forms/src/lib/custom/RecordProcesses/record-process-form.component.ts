import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJRecordProcessFormComponent } from '../../generated/Entities/MJRecordProcess/mjrecordprocess.form.component';

/**
 * Custom form override for `MJ: Record Processes`. Replaces the generated field layout (which exposes the
 * rules as a raw `Configuration` JSON textarea) with the visual `<mj-record-process-editor>` — the same
 * authoring surface used in the Bulk Operations app — so editing a process record anywhere in Explorer
 * gets the business-friendly rules builder + inline dry-run preview. The form's container owns Save; the
 * editor mutates the record in place (ShowToolbar=false).
 */
@RegisterClass(BaseFormComponent, 'MJ: Record Processes')
@Component({
    standalone: false,
    selector: 'mj-record-process-form-extended',
    templateUrl: './record-process-form.component.html',
})
export class RecordProcessFormComponentExtended extends MJRecordProcessFormComponent {}

/** Tree-shaking guard so the override registers with the ClassFactory. */
export function LoadRecordProcessFormComponentExtended(): void {
    // intentionally empty
}
