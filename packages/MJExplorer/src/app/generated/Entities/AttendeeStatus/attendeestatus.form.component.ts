import { Component } from '@angular/core';
import { AttendeeStatusEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAttendeeStatusDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Attendee Status') // Tell MemberJunction about this class
@Component({
    selector: 'gen-attendeestatus-form',
    templateUrl: './attendeestatus.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AttendeeStatusFormComponent extends BaseFormComponent {
    public record!: AttendeeStatusEntity;
} 

export function LoadAttendeeStatusFormComponent() {
    LoadAttendeeStatusDetailsComponent();
}
