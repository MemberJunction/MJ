import { Component } from '@angular/core';
import { AIAgentStepPathEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Step Paths') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentsteppath-form',
    templateUrl: './aiagentsteppath.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentStepPathFormComponent extends BaseFormComponent {
    public record!: AIAgentStepPathEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIAgentStepPathFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
