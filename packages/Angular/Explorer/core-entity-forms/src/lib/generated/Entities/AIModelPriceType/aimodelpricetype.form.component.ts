import { Component } from '@angular/core';
import { AIModelPriceTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: AI Model Price Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aimodelpricetype-form',
    templateUrl: './aimodelpricetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIModelPriceTypeFormComponent extends BaseFormComponent {
    public record!: AIModelPriceTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        mJAIModelCosts: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIModelPriceTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
