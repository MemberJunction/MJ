import { Component } from '@angular/core';
import { AIConfigurationParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Configuration Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiconfigurationparam-form',
    templateUrl: './aiconfigurationparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIConfigurationParamFormComponent extends BaseFormComponent {
    public record!: AIConfigurationParamEntity;

    // Collapsible section state
    public sectionsExpanded = {
        parameterAssignment: true,
        parameterDetails: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIConfigurationParamFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
