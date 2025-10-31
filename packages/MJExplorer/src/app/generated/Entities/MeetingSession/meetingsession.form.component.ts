import { Component } from '@angular/core';
import { MeetingSessionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingSessionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Meeting Sessions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingsession-form',
    templateUrl: './meetingsession.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingSessionFormComponent extends BaseFormComponent {
    public record!: MeetingSessionEntity;
} 

export function LoadMeetingSessionFormComponent() {
    LoadMeetingSessionDetailsComponent();
}
