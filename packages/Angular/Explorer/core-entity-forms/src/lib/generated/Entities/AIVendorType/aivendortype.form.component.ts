import { Component } from '@angular/core';
import { AIVendorTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Vendor Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aivendortype-form',
    templateUrl: './aivendortype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIVendorTypeFormComponent extends BaseFormComponent {
    public record!: AIVendorTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAIVendorTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
