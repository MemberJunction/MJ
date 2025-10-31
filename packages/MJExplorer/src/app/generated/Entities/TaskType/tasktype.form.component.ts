import { Component } from '@angular/core';
import { TaskTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTaskTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Task Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-tasktype-form',
    templateUrl: './tasktype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TaskTypeFormComponent extends BaseFormComponent {
    public record!: TaskTypeEntity;
} 

export function LoadTaskTypeFormComponent() {
    LoadTaskTypeDetailsComponent();
}
