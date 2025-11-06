import { Component } from '@angular/core';
import { FileCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'File Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-filecategory-form',
    templateUrl: './filecategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FileCategoryFormComponent extends BaseFormComponent {
    public record!: FileCategoryEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        fileCategories: false,
        files: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadFileCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
