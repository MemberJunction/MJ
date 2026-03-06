import { Component } from '@angular/core';
import { MJAIAgentLearningCycleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Learning Cycles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentlearningcycle-form',
    templateUrl: './mjaiagentlearningcycle.form.component.html'
})
export class MJAIAgentLearningCycleFormComponent extends BaseFormComponent {
    public record!: MJAIAgentLearningCycleEntity;

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

