import { Component } from '@angular/core';
import { MeetingHotelEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingHotelDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Meeting Hotels') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetinghotel-form',
    templateUrl: './meetinghotel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingHotelFormComponent extends BaseFormComponent {
    public record!: MeetingHotelEntity;
} 

export function LoadMeetingHotelFormComponent() {
    LoadMeetingHotelDetailsComponent();
}
