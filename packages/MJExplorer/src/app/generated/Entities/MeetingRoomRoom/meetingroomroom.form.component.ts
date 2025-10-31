import { Component } from '@angular/core';
import { MeetingRoomRoomEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingRoomRoomDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Meeting Room Rooms') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingroomroom-form',
    templateUrl: './meetingroomroom.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingRoomRoomFormComponent extends BaseFormComponent {
    public record!: MeetingRoomRoomEntity;
} 

export function LoadMeetingRoomRoomFormComponent() {
    LoadMeetingRoomRoomDetailsComponent();
}
