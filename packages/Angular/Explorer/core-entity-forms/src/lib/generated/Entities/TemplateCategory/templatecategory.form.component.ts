import { Component } from '@angular/core';
import { TemplateCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Template Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-templatecategory-form',
    templateUrl: './templatecategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TemplateCategoryFormComponent extends BaseFormComponent {
    public record!: TemplateCategoryEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        templateCategories: false,
        templates: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadTemplateCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
