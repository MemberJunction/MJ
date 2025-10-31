import { Component } from '@angular/core';
import { MeetingTransferEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingTransferDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Meeting Transfers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingtransfer-form',
    templateUrl: './meetingtransfer.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingTransferFormComponent extends BaseFormComponent {
    public record!: MeetingTransferEntity;
} 

export function LoadMeetingTransferFormComponent() {
    LoadMeetingTransferDetailsComponent();
}
