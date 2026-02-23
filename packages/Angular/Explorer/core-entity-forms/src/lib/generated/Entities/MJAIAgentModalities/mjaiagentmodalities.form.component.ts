import { Component } from '@angular/core';
import { MJAIAgentModalitiesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Modalities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentmodalities-form',
    templateUrl: './mjaiagentmodalities.form.component.html'
})
export class MJAIAgentModalitiesFormComponent extends BaseFormComponent {
    public record!: MJAIAgentModalitiesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'agentReference', sectionName: 'Agent Reference', isExpanded: true },
            { sectionKey: 'modalityConfiguration', sectionName: 'Modality Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

