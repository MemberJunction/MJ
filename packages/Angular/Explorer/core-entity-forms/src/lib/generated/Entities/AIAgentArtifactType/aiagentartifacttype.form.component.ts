import { Component } from '@angular/core';
import { AIAgentArtifactTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Artifact Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiagentartifacttype-form',
    templateUrl: './aiagentartifacttype.form.component.html'
})
export class AIAgentArtifactTypeFormComponent extends BaseFormComponent {
    public record!: AIAgentArtifactTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'linkDefinition', sectionName: 'Link Definition', isExpanded: true },
            { sectionKey: 'displayNames', sectionName: 'Display Names', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadAIAgentArtifactTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
