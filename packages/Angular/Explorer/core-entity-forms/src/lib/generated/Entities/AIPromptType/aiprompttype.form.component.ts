import { Component } from '@angular/core';
import { AIPromptTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'AI Prompt Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiprompttype-form',
    templateUrl: './aiprompttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIPromptTypeFormComponent extends BaseFormComponent {
    public record!: AIPromptTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        promptTypeInformation: true,
        systemMetadata: false,
        aIPrompts: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIPromptTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
