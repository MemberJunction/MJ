import { Component } from '@angular/core';
import { MeetingStatusEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingStatusDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Meeting Status') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingstatus-form',
    templateUrl: './meetingstatus.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingStatusFormComponent extends BaseFormComponent {
    public record!: MeetingStatusEntity;
} 

export function LoadMeetingStatusFormComponent() {
    LoadMeetingStatusDetailsComponent();
}
