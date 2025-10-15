import { Component } from '@angular/core';
import { ScheduledJobEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadScheduledJobDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Jobs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scheduledjob-form',
    templateUrl: './scheduledjob.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ScheduledJobFormComponent extends BaseFormComponent {
    public record!: ScheduledJobEntity;
} 

export function LoadScheduledJobFormComponent() {
    LoadScheduledJobDetailsComponent();
}
