import { Component } from '@angular/core';
import { MeetingSpeakerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingSpeakerDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Meeting Speakers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingspeaker-form',
    templateUrl: './meetingspeaker.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingSpeakerFormComponent extends BaseFormComponent {
    public record!: MeetingSpeakerEntity;
} 

export function LoadMeetingSpeakerFormComponent() {
    LoadMeetingSpeakerDetailsComponent();
}
