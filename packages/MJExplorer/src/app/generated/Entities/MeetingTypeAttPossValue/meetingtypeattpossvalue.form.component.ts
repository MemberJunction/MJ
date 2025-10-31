import { Component } from '@angular/core';
import { MeetingTypeAttPossValueEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingTypeAttPossValueDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Meeting Type Att Poss Values') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingtypeattpossvalue-form',
    templateUrl: './meetingtypeattpossvalue.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingTypeAttPossValueFormComponent extends BaseFormComponent {
    public record!: MeetingTypeAttPossValueEntity;
} 

export function LoadMeetingTypeAttPossValueFormComponent() {
    LoadMeetingTypeAttPossValueDetailsComponent();
}
