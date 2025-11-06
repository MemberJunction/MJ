import { Component } from '@angular/core';
import { CommunicationBaseMessageTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Communication Base Message Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-communicationbasemessagetype-form',
    templateUrl: './communicationbasemessagetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommunicationBaseMessageTypeFormComponent extends BaseFormComponent {
    public record!: CommunicationBaseMessageTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        communicationProviderMessageTypes: false,
        entityCommunicationMessageTypes: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadCommunicationBaseMessageTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
