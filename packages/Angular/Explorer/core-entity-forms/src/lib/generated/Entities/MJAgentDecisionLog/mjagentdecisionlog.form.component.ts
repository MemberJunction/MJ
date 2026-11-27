import { Component } from '@angular/core';
import { MJAgentDecisionLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Agent Decision Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjagentdecisionlog-form',
    templateUrl: './mjagentdecisionlog.form.component.html'
})
export class MJAgentDecisionLogFormComponent extends BaseFormComponent {
    public record!: MJAgentDecisionLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sessionAndRunInfo', sectionName: 'Session and Run Info', isExpanded: true },
            { sectionKey: 'decisionDetails', sectionName: 'Decision Details', isExpanded: true },
            { sectionKey: 'executionContext', sectionName: 'Execution Context', isExpanded: true },
            { sectionKey: 'payloadAndHashes', sectionName: 'Payload and Hashes', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

