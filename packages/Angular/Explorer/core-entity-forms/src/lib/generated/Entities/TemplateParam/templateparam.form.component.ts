import { Component } from '@angular/core';
import { TemplateParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Template Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-templateparam-form',
    templateUrl: './templateparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TemplateParamFormComponent extends BaseFormComponent {
    public record!: TemplateParamEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadTemplateParamFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
