import { Component } from '@angular/core';
import { ActionParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Action Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionparam-form',
    templateUrl: './actionparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionParamFormComponent extends BaseFormComponent {
    public record!: ActionParamEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        entityActionParams: false,
        scheduledActionParams: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadActionParamFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
