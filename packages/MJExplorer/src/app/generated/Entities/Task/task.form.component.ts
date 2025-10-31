import { Component } from '@angular/core';
import { TaskEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTaskDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Tasks') // Tell MemberJunction about this class
@Component({
    selector: 'gen-task-form',
    templateUrl: './task.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TaskFormComponent extends BaseFormComponent {
    public record!: TaskEntity;
} 

export function LoadTaskFormComponent() {
    LoadTaskDetailsComponent();
}
