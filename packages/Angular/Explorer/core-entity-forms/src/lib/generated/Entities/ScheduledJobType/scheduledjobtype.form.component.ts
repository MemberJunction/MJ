import { Component } from '@angular/core';
import { ScheduledJobTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadScheduledJobTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Job Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scheduledjobtype-form',
    templateUrl: './scheduledjobtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ScheduledJobTypeFormComponent extends BaseFormComponent {
    public record!: ScheduledJobTypeEntity;
} 

export function LoadScheduledJobTypeFormComponent() {
    LoadScheduledJobTypeDetailsComponent();
}
