import { Component } from '@angular/core';
import { MeetingTypeAttributeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingTypeAttributeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Meeting Type Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingtypeattribute-form',
    templateUrl: './meetingtypeattribute.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingTypeAttributeFormComponent extends BaseFormComponent {
    public record!: MeetingTypeAttributeEntity;
} 

export function LoadMeetingTypeAttributeFormComponent() {
    LoadMeetingTypeAttributeDetailsComponent();
}
