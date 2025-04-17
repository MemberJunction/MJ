import { Component } from '@angular/core';
import { AttendeeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAttendeeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Attendees') // Tell MemberJunction about this class
@Component({
    selector: 'gen-attendee-form',
    templateUrl: './attendee.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AttendeeFormComponent extends BaseFormComponent {
    public record!: AttendeeEntity;
} 

export function LoadAttendeeFormComponent() {
    LoadAttendeeDetailsComponent();
}
