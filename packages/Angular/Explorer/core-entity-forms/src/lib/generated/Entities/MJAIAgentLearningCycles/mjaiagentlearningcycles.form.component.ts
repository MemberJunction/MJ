import { Component } from '@angular/core';
import { MJAIAgentLearningCyclesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Learning Cycles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentlearningcycles-form',
    templateUrl: './mjaiagentlearningcycles.form.component.html'
})
export class MJAIAgentLearningCyclesFormComponent extends BaseFormComponent {
    public record!: MJAIAgentLearningCyclesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'agentReference', sectionName: 'Agent Reference', isExpanded: true },
            { sectionKey: 'cycleTimingStatus', sectionName: 'Cycle Timing & Status', isExpanded: true },
            { sectionKey: 'learningDetailsAudit', sectionName: 'Learning Details & Audit', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

