import { Component } from '@angular/core';
import { ActionExecutionLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActionExecutionLogDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Action Execution Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionexecutionlog-form',
    templateUrl: './actionexecutionlog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionExecutionLogFormComponent extends BaseFormComponent {
    public record!: ActionExecutionLogEntity;
} 

export function LoadActionExecutionLogFormComponent() {
    LoadActionExecutionLogDetailsComponent();
}
