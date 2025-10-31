import { Component } from '@angular/core';
import { MeetingTimeSlotEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingTimeSlotDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Meeting Time Slots') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingtimeslot-form',
    templateUrl: './meetingtimeslot.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingTimeSlotFormComponent extends BaseFormComponent {
    public record!: MeetingTimeSlotEntity;
} 

export function LoadMeetingTimeSlotFormComponent() {
    LoadMeetingTimeSlotDetailsComponent();
}
