import { Component } from '@angular/core';
import { TaskDependencyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTaskDependencyDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Task Dependencies') // Tell MemberJunction about this class
@Component({
    selector: 'gen-taskdependency-form',
    templateUrl: './taskdependency.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TaskDependencyFormComponent extends BaseFormComponent {
    public record!: TaskDependencyEntity;
} 

export function LoadTaskDependencyFormComponent() {
    LoadTaskDependencyDetailsComponent();
}
