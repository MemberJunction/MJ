import { Component } from '@angular/core';
import { MeetingTrackEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingTrackDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Meeting Tracks') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingtrack-form',
    templateUrl: './meetingtrack.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingTrackFormComponent extends BaseFormComponent {
    public record!: MeetingTrackEntity;
} 

export function LoadMeetingTrackFormComponent() {
    LoadMeetingTrackDetailsComponent();
}
