import { Component } from '@angular/core';
import { MJAIAgentPairedAgentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Paired Agents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentpairedagent-form',
    templateUrl: './mjaiagentpairedagent.form.component.html'
})
export class MJAIAgentPairedAgentFormComponent extends BaseFormComponent {
    public record!: MJAIAgentPairedAgentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'agentPairing', sectionName: 'Agent Pairing', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

