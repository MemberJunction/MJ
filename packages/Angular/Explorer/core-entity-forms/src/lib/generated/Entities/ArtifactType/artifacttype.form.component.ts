import { Component } from '@angular/core';
import { ArtifactTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Artifact Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-artifacttype-form',
    templateUrl: './artifacttype.form.component.html'
})
export class ArtifactTypeFormComponent extends BaseFormComponent {
    public record!: ArtifactTypeEntity;

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

export function LoadArtifactTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
