import { Component } from '@angular/core';
import { MJAIAgentModalityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Modalities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentmodality-form',
    templateUrl: './mjaiagentmodality.form.component.html'
})
export class MJAIAgentModalityFormComponent extends BaseFormComponent {
    public record!: MJAIAgentModalityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'agentReference', sectionName: 'Agent Reference', isExpanded: true },
            { sectionKey: 'modalityConfiguration', sectionName: 'Modality Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

