import { Component } from '@angular/core';
import { AIAgentDataSourceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Data Sources') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentdatasource-form',
    templateUrl: './aiagentdatasource.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentDataSourceFormComponent extends BaseFormComponent {
    public record!: AIAgentDataSourceEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIAgentDataSourceFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
