import { Component } from '@angular/core';
import { MJAIAgentArtifactTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Artifact Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentartifacttypes-form',
    templateUrl: './mjaiagentartifacttypes.form.component.html'
})
export class MJAIAgentArtifactTypesFormComponent extends BaseFormComponent {
    public record!: MJAIAgentArtifactTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'linkDefinition', sectionName: 'Link Definition', isExpanded: true },
            { sectionKey: 'displayNames', sectionName: 'Display Names', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

