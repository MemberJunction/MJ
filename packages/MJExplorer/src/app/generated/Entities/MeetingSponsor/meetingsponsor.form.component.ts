import { Component } from '@angular/core';
import { MeetingSponsorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingSponsorDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Meeting Sponsors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingsponsor-form',
    templateUrl: './meetingsponsor.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingSponsorFormComponent extends BaseFormComponent {
    public record!: MeetingSponsorEntity;
} 

export function LoadMeetingSponsorFormComponent() {
    LoadMeetingSponsorDetailsComponent();
}
