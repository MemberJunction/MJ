import { Component } from '@angular/core';
import { MJAIAgentModelsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Models') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentmodels-form',
    templateUrl: './mjaiagentmodels.form.component.html'
})
export class MJAIAgentModelsFormComponent extends BaseFormComponent {
    public record!: MJAIAgentModelsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'mappingIdentifiers', sectionName: 'Mapping Identifiers', isExpanded: true },
            { sectionKey: 'agentModelConfiguration', sectionName: 'Agent Model Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

