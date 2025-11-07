import { Component } from '@angular/core';
import { AIAgentRequestEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'AI Agent Requests') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentrequest-form',
    templateUrl: './aiagentrequest.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentRequestFormComponent extends BaseFormComponent {
    public record!: AIAgentRequestEntity;

    // Collapsible section state
    public sectionsExpanded = {
        requestSummary: true,
        responseSummary: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIAgentRequestFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
