import { Component } from '@angular/core';
import { ActionCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Action Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actioncategory-form',
    templateUrl: './actioncategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionCategoryFormComponent extends BaseFormComponent {
    public record!: ActionCategoryEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        actionCategories: false,
        actions: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadActionCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
