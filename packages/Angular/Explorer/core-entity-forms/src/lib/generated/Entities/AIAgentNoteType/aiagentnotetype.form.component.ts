import { Component } from '@angular/core';
import { AIAgentNoteTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'AI Agent Note Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentnotetype-form',
    templateUrl: './aiagentnotetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentNoteTypeFormComponent extends BaseFormComponent {
    public record!: AIAgentNoteTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        aIAgentNotes: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIAgentNoteTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
