import { Component } from '@angular/core';
import { MeetingTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Meeting Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingtype-form',
    templateUrl: './meetingtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingTypeFormComponent extends BaseFormComponent {
    public record!: MeetingTypeEntity;
} 

export function LoadMeetingTypeFormComponent() {
    LoadMeetingTypeDetailsComponent();
}
