import { Component } from '@angular/core';
import { ActivityTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActivityTypeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Activity Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-activitytype-form',
    templateUrl: './activitytype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActivityTypeFormComponent extends BaseFormComponent {
    public record!: ActivityTypeEntity;
} 

export function LoadActivityTypeFormComponent() {
    LoadActivityTypeDetailsComponent();
}
