import { Component } from '@angular/core';
import { AIAgentModalityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Modalities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiagentmodality-form',
    templateUrl: './aiagentmodality.form.component.html'
})
export class AIAgentModalityFormComponent extends BaseFormComponent {
    public record!: AIAgentModalityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'agentReference', sectionName: 'Agent Reference', isExpanded: true },
            { sectionKey: 'modalityConfiguration', sectionName: 'Modality Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadAIAgentModalityFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
