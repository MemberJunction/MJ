import { Component } from '@angular/core';
import { AIPromptCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'AI Prompt Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aipromptcategory-form',
    templateUrl: './aipromptcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIPromptCategoryFormComponent extends BaseFormComponent {
    public record!: AIPromptCategoryEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        aIPrompts: false,
        aIPromptCategories: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIPromptCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
