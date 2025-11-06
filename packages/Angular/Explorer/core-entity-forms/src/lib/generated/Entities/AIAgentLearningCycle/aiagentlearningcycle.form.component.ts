import { Component } from '@angular/core';
import { AIAgentLearningCycleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'AI Agent Learning Cycles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentlearningcycle-form',
    templateUrl: './aiagentlearningcycle.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentLearningCycleFormComponent extends BaseFormComponent {
    public record!: AIAgentLearningCycleEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIAgentLearningCycleFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
