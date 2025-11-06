import { Component } from '@angular/core';
import { ReportCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Report Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-reportcategory-form',
    templateUrl: './reportcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReportCategoryFormComponent extends BaseFormComponent {
    public record!: ReportCategoryEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        reportCategories: false,
        reports: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadReportCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
