import { Component } from '@angular/core';
import { MeetingTransferEmailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingTransferEmailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Meeting Transfer Emails') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingtransferemail-form',
    templateUrl: './meetingtransferemail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingTransferEmailFormComponent extends BaseFormComponent {
    public record!: MeetingTransferEmailEntity;
} 

export function LoadMeetingTransferEmailFormComponent() {
    LoadMeetingTransferEmailDetailsComponent();
}
