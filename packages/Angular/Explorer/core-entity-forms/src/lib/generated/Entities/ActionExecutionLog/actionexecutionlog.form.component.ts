import { Component } from '@angular/core';
import { ActionExecutionLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Action Execution Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-actionexecutionlog-form',
    templateUrl: './actionexecutionlog.form.component.html'
})
export class ActionExecutionLogFormComponent extends BaseFormComponent {
    public record!: ActionExecutionLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'retentionAudit', sectionName: 'Retention & Audit', isExpanded: true },
            { sectionKey: 'associatedEntities', sectionName: 'Associated Entities', isExpanded: true },
            { sectionKey: 'executionDetails', sectionName: 'Execution Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadActionExecutionLogFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
