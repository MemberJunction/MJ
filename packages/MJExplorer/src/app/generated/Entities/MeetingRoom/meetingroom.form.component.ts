import { Component } from '@angular/core';
import { MeetingRoomEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingRoomDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Meeting Rooms') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingroom-form',
    templateUrl: './meetingroom.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingRoomFormComponent extends BaseFormComponent {
    public record!: MeetingRoomEntity;
} 

export function LoadMeetingRoomFormComponent() {
    LoadMeetingRoomDetailsComponent();
}
