import { Component } from '@angular/core';
import { AIAgentNoteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'AI Agent Notes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentnote-form',
    templateUrl: './aiagentnote.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentNoteFormComponent extends BaseFormComponent {
    public record!: AIAgentNoteEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIAgentNoteFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
