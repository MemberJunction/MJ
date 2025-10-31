import { Component } from '@angular/core';
import { TaskLinkEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTaskLinkDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Task Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-tasklink-form',
    templateUrl: './tasklink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TaskLinkFormComponent extends BaseFormComponent {
    public record!: TaskLinkEntity;
} 

export function LoadTaskLinkFormComponent() {
    LoadTaskLinkDetailsComponent();
}
