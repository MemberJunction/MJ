import { Component } from '@angular/core';
import { ActionExecutionLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Action Execution Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionexecutionlog-form',
    templateUrl: './actionexecutionlog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionExecutionLogFormComponent extends BaseFormComponent {
    public record!: ActionExecutionLogEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadActionExecutionLogFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
