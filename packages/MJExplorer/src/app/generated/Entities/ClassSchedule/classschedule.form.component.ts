import { Component } from '@angular/core';
import { ClassScheduleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadClassScheduleDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Class Schedules') // Tell MemberJunction about this class
@Component({
    selector: 'gen-classschedule-form',
    templateUrl: './classschedule.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ClassScheduleFormComponent extends BaseFormComponent {
    public record!: ClassScheduleEntity;
} 

export function LoadClassScheduleFormComponent() {
    LoadClassScheduleDetailsComponent();
}
