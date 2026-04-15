import { Component } from '@angular/core';
import { MJAIAgentModelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Models') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentmodel-form',
    templateUrl: './mjaiagentmodel.form.component.html'
})
export class MJAIAgentModelFormComponent extends BaseFormComponent {
    public record!: MJAIAgentModelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'mappingIdentifiers', sectionName: 'Mapping Identifiers', isExpanded: true },
            { sectionKey: 'agentModelConfiguration', sectionName: 'Agent Model Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

