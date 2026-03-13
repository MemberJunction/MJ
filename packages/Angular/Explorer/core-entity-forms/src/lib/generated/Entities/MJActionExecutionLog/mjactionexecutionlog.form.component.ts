import { Component } from '@angular/core';
import { MJActionExecutionLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Action Execution Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjactionexecutionlog-form',
    templateUrl: './mjactionexecutionlog.form.component.html'
})
export class MJActionExecutionLogFormComponent extends BaseFormComponent {
    public record!: MJActionExecutionLogEntity;

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

