import { Component } from '@angular/core';
import { AIModelCostEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Model Costs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aimodelcost-form',
    templateUrl: './aimodelcost.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIModelCostFormComponent extends BaseFormComponent {
    public record!: AIModelCostEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIModelCostFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
