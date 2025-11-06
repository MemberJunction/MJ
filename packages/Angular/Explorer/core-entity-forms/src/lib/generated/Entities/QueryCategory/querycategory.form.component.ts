import { Component } from '@angular/core';
import { QueryCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Query Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-querycategory-form',
    templateUrl: './querycategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueryCategoryFormComponent extends BaseFormComponent {
    public record!: QueryCategoryEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        queries: false,
        queryCategories: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadQueryCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
