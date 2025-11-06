import { Component } from '@angular/core';
import { AIVendorTypeDefinitionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: AI Vendor Type Definitions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aivendortypedefinition-form',
    templateUrl: './aivendortypedefinition.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIVendorTypeDefinitionFormComponent extends BaseFormComponent {
    public record!: AIVendorTypeDefinitionEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        mJAIModelVendors: false,
        mJAIVendorTypes: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIVendorTypeDefinitionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
