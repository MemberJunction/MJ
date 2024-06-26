import { Component } from '@angular/core';
import { RecordMergeLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRecordMergeLogDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Record Merge Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recordmergelog-form',
    templateUrl: './recordmergelog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecordMergeLogFormComponent extends BaseFormComponent {
    public record!: RecordMergeLogEntity;
} 

export function LoadRecordMergeLogFormComponent() {
    LoadRecordMergeLogDetailsComponent();
}
