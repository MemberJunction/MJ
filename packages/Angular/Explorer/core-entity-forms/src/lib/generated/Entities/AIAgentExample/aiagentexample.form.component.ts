import { Component } from '@angular/core';
import { AIAgentExampleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Examples') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentexample-form',
    templateUrl: './aiagentexample.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentExampleFormComponent extends BaseFormComponent {
    public record!: AIAgentExampleEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIAgentExampleFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
