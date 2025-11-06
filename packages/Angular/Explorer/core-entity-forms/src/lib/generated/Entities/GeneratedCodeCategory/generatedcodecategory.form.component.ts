import { Component } from '@angular/core';
import { GeneratedCodeCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Generated Code Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-generatedcodecategory-form',
    templateUrl: './generatedcodecategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GeneratedCodeCategoryFormComponent extends BaseFormComponent {
    public record!: GeneratedCodeCategoryEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        generatedCodeCategories: false,
        generatedCodes: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadGeneratedCodeCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
