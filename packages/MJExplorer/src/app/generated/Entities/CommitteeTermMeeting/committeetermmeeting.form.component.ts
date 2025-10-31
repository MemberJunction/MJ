import { Component } from '@angular/core';
import { CommitteeTermMeetingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommitteeTermMeetingDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Committee Term Meetings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-committeetermmeeting-form',
    templateUrl: './committeetermmeeting.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommitteeTermMeetingFormComponent extends BaseFormComponent {
    public record!: CommitteeTermMeetingEntity;
} 

export function LoadCommitteeTermMeetingFormComponent() {
    LoadCommitteeTermMeetingDetailsComponent();
}
