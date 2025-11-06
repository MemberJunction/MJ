import { Component } from '@angular/core';
import { AIModelVendorEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Model Vendors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aimodelvendor-form',
    templateUrl: './aimodelvendor.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIModelVendorFormComponent extends BaseFormComponent {
    public record!: AIModelVendorEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIModelVendorFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
