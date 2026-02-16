import { Component } from '@angular/core';
import { MJArtifactTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Artifact Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjartifacttype-form',
    templateUrl: './mjartifacttype.form.component.html'
})
export class MJArtifactTypeFormComponent extends BaseFormComponent {
    public record!: MJArtifactTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'artifactTypeDefinition', sectionName: 'Artifact Type Definition', isExpanded: true },
            { sectionKey: 'hierarchyInheritance', sectionName: 'Hierarchy & Inheritance', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentArtifactTypes', sectionName: 'MJ: AI Agent Artifact Types', isExpanded: false },
            { sectionKey: 'mJConversationArtifacts', sectionName: 'MJ: Conversation Artifacts', isExpanded: false },
            { sectionKey: 'mJArtifactTypes', sectionName: 'MJ: Artifact Types', isExpanded: false },
            { sectionKey: 'mJArtifacts', sectionName: 'MJ: Artifacts', isExpanded: false },
            { sectionKey: 'aIAgents', sectionName: 'AI Agents', isExpanded: false }
        ]);
    }
}

