import { Component } from '@angular/core';
import { AIAgentArtifactTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Artifact Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentartifacttype-form',
    templateUrl: './aiagentartifacttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentArtifactTypeFormComponent extends BaseFormComponent {
    public record!: AIAgentArtifactTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIAgentArtifactTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
