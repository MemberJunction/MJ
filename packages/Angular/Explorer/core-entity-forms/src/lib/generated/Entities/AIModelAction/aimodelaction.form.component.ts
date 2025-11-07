import { Component } from '@angular/core';
import { AIModelActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'AI Model Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aimodelaction-form',
    templateUrl: './aimodelaction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIModelActionFormComponent extends BaseFormComponent {
    public record!: AIModelActionEntity;

    // Collapsible section state
    public sectionsExpanded = {
        modelConfiguration: true,
        actionSettings: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIModelActionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
