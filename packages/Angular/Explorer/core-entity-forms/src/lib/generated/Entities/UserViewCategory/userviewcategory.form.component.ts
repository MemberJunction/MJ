import { Component } from '@angular/core';
import { UserViewCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'User View Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userviewcategory-form',
    templateUrl: './userviewcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserViewCategoryFormComponent extends BaseFormComponent {
    public record!: UserViewCategoryEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        userViewCategories: false,
        userViews: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadUserViewCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
