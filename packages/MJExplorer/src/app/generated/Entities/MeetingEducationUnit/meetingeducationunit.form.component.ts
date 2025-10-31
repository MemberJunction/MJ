import { Component } from '@angular/core';
import { MeetingEducationUnitEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingEducationUnitDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Meeting Education Units') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingeducationunit-form',
    templateUrl: './meetingeducationunit.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingEducationUnitFormComponent extends BaseFormComponent {
    public record!: MeetingEducationUnitEntity;
} 

export function LoadMeetingEducationUnitFormComponent() {
    LoadMeetingEducationUnitDetailsComponent();
}
