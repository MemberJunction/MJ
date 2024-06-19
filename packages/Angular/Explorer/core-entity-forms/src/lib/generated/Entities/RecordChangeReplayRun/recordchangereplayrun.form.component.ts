import { Component } from '@angular/core';
import { RecordChangeReplayRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRecordChangeReplayRunDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Record Change Replay Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recordchangereplayrun-form',
    templateUrl: './recordchangereplayrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecordChangeReplayRunFormComponent extends BaseFormComponent {
    public record!: RecordChangeReplayRunEntity;
} 

export function LoadRecordChangeReplayRunFormComponent() {
    LoadRecordChangeReplayRunDetailsComponent();
}
