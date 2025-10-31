import { Component } from '@angular/core';
import { MeetingResourceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMeetingResourceDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Meeting Resources') // Tell MemberJunction about this class
@Component({
    selector: 'gen-meetingresource-form',
    templateUrl: './meetingresource.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MeetingResourceFormComponent extends BaseFormComponent {
    public record!: MeetingResourceEntity;
} 

export function LoadMeetingResourceFormComponent() {
    LoadMeetingResourceDetailsComponent();
}
