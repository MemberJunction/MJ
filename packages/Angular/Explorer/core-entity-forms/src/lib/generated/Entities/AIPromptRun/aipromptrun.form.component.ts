import { Component } from '@angular/core';
import { AIPromptRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aipromptrun-form',
    templateUrl: './aipromptrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIPromptRunFormComponent extends BaseFormComponent {
    public record!: AIPromptRunEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        mJAIPromptRuns: false,
        aIResultCache: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIPromptRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
