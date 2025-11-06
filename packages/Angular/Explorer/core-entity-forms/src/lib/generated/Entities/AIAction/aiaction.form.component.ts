import { Component } from '@angular/core';
import { AIActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'AI Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiaction-form',
    templateUrl: './aiaction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIActionFormComponent extends BaseFormComponent {
    public record!: AIActionEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        aIModelActions: false,
        entityAIActions: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIActionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
