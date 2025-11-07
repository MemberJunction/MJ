import { Component } from '@angular/core';
import { AIAgentModelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'AI Agent Models') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentmodel-form',
    templateUrl: './aiagentmodel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentModelFormComponent extends BaseFormComponent {
    public record!: AIAgentModelEntity;

    // Collapsible section state
    public sectionsExpanded = {
        mappingIdentifiers: true,
        agentModelConfiguration: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIAgentModelFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
