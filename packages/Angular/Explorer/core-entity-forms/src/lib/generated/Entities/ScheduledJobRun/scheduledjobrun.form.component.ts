import { Component } from '@angular/core';
import { ScheduledJobRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadScheduledJobRunDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Job Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scheduledjobrun-form',
    templateUrl: './scheduledjobrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ScheduledJobRunFormComponent extends BaseFormComponent {
    public record!: ScheduledJobRunEntity;
} 

export function LoadScheduledJobRunFormComponent() {
    LoadScheduledJobRunDetailsComponent();
}
