import { Component } from '@angular/core';
import { MeetingAttendeeTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingAttendeeTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Meeting Attendee Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingattendeetype-form',
    templateUrl: './meetingattendeetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingAttendeeTypeFormComponent extends BaseFormComponent {
    public record!: MeetingAttendeeTypeEntity;
} 

export function LoadMeetingAttendeeTypeFormComponent() {
    LoadMeetingAttendeeTypeDetailsComponent();
}
