import { Component } from '@angular/core';
import { AIAgentPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentpermission-form',
    templateUrl: './aiagentpermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentPermissionFormComponent extends BaseFormComponent {
    public record!: AIAgentPermissionEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIAgentPermissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
