import { Component } from '@angular/core';
import { MeetingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Meetings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meeting-form',
    templateUrl: './meeting.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingFormComponent extends BaseFormComponent {
    public record!: MeetingEntity;
} 

export function LoadMeetingFormComponent() {
    LoadMeetingDetailsComponent();
}
