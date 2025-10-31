import { Component } from '@angular/core';
import { MeetingAttributeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingAttributeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Meeting Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingattribute-form',
    templateUrl: './meetingattribute.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingAttributeFormComponent extends BaseFormComponent {
    public record!: MeetingAttributeEntity;
} 

export function LoadMeetingAttributeFormComponent() {
    LoadMeetingAttributeDetailsComponent();
}
