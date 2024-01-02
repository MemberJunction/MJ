import { Component } from '@angular/core';
import { RecordMergeDeletionLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadRecordMergeDeletionLogDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Record Merge Deletion Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recordmergedeletionlog-form',
    templateUrl: './recordmergedeletionlog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecordMergeDeletionLogFormComponent extends BaseFormComponent {
    public record: RecordMergeDeletionLogEntity | null = null;
} 

export function LoadRecordMergeDeletionLogFormComponent() {
    LoadRecordMergeDeletionLogDetailsComponent();
}
