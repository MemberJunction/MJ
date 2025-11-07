import { Component } from '@angular/core';
import { OutputFormatTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Output Format Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-outputformattype-form',
    templateUrl: './outputformattype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OutputFormatTypeFormComponent extends BaseFormComponent {
    public record!: OutputFormatTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        formatDetails: true,
        systemMetadata: false,
        reports: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadOutputFormatTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
