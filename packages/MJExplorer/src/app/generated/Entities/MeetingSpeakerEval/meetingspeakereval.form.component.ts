import { Component } from '@angular/core';
import { MeetingSpeakerEvalEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingSpeakerEvalDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Meeting Speaker Evals') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingspeakereval-form',
    templateUrl: './meetingspeakereval.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingSpeakerEvalFormComponent extends BaseFormComponent {
    public record!: MeetingSpeakerEvalEntity;
} 

export function LoadMeetingSpeakerEvalFormComponent() {
    LoadMeetingSpeakerEvalDetailsComponent();
}
