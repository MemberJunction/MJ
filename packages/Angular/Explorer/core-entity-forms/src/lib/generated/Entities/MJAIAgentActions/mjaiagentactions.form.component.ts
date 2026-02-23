import { Component } from '@angular/core';
import { MJAIAgentActionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentactions-form',
    templateUrl: './mjaiagentactions.form.component.html'
})
export class MJAIAgentActionsFormComponent extends BaseFormComponent {
    public record!: MJAIAgentActionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'mappingRelationships', sectionName: 'Mapping & Relationships', isExpanded: true },
            { sectionKey: 'auditStatus', sectionName: 'Audit & Status', isExpanded: true },
            { sectionKey: 'executionConstraints', sectionName: 'Execution Constraints', isExpanded: false },
            { sectionKey: 'resultCompaction', sectionName: 'Result Compaction', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

