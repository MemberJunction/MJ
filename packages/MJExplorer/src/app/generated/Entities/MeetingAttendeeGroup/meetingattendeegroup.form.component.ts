import { Component } from '@angular/core';
import { MeetingAttendeeGroupEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingAttendeeGroupDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Meeting Attendee Groups') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingattendeegroup-form',
    templateUrl: './meetingattendeegroup.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingAttendeeGroupFormComponent extends BaseFormComponent {
    public record!: MeetingAttendeeGroupEntity;
} 

export function LoadMeetingAttendeeGroupFormComponent() {
    LoadMeetingAttendeeGroupDetailsComponent();
}
