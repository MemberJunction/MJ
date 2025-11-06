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
        details: true,
        reports: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadOutputFormatTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
