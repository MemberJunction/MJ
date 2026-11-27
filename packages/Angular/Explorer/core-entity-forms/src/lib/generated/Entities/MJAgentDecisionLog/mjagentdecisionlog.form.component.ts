import { Component } from '@angular/core';
import { MJAgentDecisionLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Agent Decision Log') // Tell MemberJunction about this class
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
            { sectionKey: 'sessionAndExecutionContext', sectionName: 'Session and Execution Context', isExpanded: true },
            { sectionKey: 'decisionAndPayload', sectionName: 'Decision and Payload', isExpanded: true }
        ]);
    }
}

