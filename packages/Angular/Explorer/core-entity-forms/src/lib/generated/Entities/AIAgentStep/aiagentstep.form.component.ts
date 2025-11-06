import { Component } from '@angular/core';
import { AIAgentStepEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Steps') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentstep-form',
    templateUrl: './aiagentstep.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentStepFormComponent extends BaseFormComponent {
    public record!: AIAgentStepEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        mJAIAgentStepPaths: false,
        mJAIAgentStepPaths1: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIAgentStepFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
