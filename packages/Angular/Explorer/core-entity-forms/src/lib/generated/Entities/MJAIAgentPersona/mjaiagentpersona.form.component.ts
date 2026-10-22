import { Component } from '@angular/core';
import { MJAIAgentPersonaEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Personas') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentpersona-form',
    templateUrl: './mjaiagentpersona.form.component.html'
})
export class MJAIAgentPersonaFormComponent extends BaseFormComponent {
    public record!: MJAIAgentPersonaEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'agentAssignment', sectionName: 'Agent Assignment', isExpanded: true },
            { sectionKey: 'personaConfiguration', sectionName: 'Persona Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

