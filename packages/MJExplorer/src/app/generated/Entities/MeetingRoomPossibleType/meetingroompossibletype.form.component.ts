import { Component } from '@angular/core';
import { MeetingRoomPossibleTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingRoomPossibleTypeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Meeting Room Possible Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingroompossibletype-form',
    templateUrl: './meetingroompossibletype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingRoomPossibleTypeFormComponent extends BaseFormComponent {
    public record!: MeetingRoomPossibleTypeEntity;
} 

export function LoadMeetingRoomPossibleTypeFormComponent() {
    LoadMeetingRoomPossibleTypeDetailsComponent();
}
