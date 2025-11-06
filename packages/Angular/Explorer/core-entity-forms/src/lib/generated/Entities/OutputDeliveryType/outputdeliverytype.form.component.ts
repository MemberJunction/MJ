import { Component } from '@angular/core';
import { OutputDeliveryTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Output Delivery Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-outputdeliverytype-form',
    templateUrl: './outputdeliverytype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OutputDeliveryTypeFormComponent extends BaseFormComponent {
    public record!: OutputDeliveryTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        reports: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadOutputDeliveryTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
