import { Component } from '@angular/core';
import { AIAgentActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'AI Agent Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiagentaction-form',
    templateUrl: './aiagentaction.form.component.html'
})
export class AIAgentActionFormComponent extends BaseFormComponent {
    public record!: AIAgentActionEntity;

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

