import { Component } from '@angular/core';
import { AIAgentPromptEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Prompts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentprompt-form',
    templateUrl: './aiagentprompt.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentPromptFormComponent extends BaseFormComponent {
    public record!: AIAgentPromptEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIAgentPromptFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
