import { Component } from '@angular/core';
import { ActionFilterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Action Filters') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionfilter-form',
    templateUrl: './actionfilter.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionFilterFormComponent extends BaseFormComponent {
    public record!: ActionFilterEntity;

    // Collapsible section state
    public sectionsExpanded = {
        filterDetails: true,
        systemMetadata: false,
        entityActionFilters: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadActionFilterFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
