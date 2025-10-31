import { Component } from '@angular/core';
import { MeetingRoomTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingRoomTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Meeting Room Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingroomtype-form',
    templateUrl: './meetingroomtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingRoomTypeFormComponent extends BaseFormComponent {
    public record!: MeetingRoomTypeEntity;
} 

export function LoadMeetingRoomTypeFormComponent() {
    LoadMeetingRoomTypeDetailsComponent();
}
