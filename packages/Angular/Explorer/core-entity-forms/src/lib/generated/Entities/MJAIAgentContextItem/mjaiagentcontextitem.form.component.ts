import { Component } from '@angular/core';
import { MJAIAgentContextItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Context Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentcontextitem-form',
    templateUrl: './mjaiagentcontextitem.form.component.html'
})
export class MJAIAgentContextItemFormComponent extends BaseFormComponent {
    public record!: MJAIAgentContextItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'executionContext', sectionName: 'Execution Context', isExpanded: true },
            { sectionKey: 'telemetryAndScoring', sectionName: 'Telemetry and Scoring', isExpanded: true },
            { sectionKey: 'itemReferences', sectionName: 'Item References', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

