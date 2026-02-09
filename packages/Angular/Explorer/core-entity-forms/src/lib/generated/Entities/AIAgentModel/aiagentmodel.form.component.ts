import { Component } from '@angular/core';
import { AIAgentModelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'AI Agent Models') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiagentmodel-form',
    templateUrl: './aiagentmodel.form.component.html'
})
export class AIAgentModelFormComponent extends BaseFormComponent {
    public record!: AIAgentModelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'mappingIdentifiers', sectionName: 'Mapping Identifiers', isExpanded: true },
            { sectionKey: 'agentModelConfiguration', sectionName: 'Agent Model Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

