import { Component } from '@angular/core';
import { MeetingAttPossValueEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingAttPossValueDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Meeting Att Poss Values') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingattpossvalue-form',
    templateUrl: './meetingattpossvalue.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingAttPossValueFormComponent extends BaseFormComponent {
    public record!: MeetingAttPossValueEntity;
} 

export function LoadMeetingAttPossValueFormComponent() {
    LoadMeetingAttPossValueDetailsComponent();
}
