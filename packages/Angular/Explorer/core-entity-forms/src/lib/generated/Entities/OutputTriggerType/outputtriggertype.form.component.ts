import { Component } from '@angular/core';
import { OutputTriggerTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Output Trigger Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-outputtriggertype-form',
    templateUrl: './outputtriggertype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OutputTriggerTypeFormComponent extends BaseFormComponent {
    public record!: OutputTriggerTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        reports: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadOutputTriggerTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
