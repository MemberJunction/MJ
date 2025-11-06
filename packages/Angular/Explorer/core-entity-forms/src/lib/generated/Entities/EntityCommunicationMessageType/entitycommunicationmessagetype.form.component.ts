import { Component } from '@angular/core';
import { EntityCommunicationMessageTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Entity Communication Message Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitycommunicationmessagetype-form',
    templateUrl: './entitycommunicationmessagetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityCommunicationMessageTypeFormComponent extends BaseFormComponent {
    public record!: EntityCommunicationMessageTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        entityCommunicationFields: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntityCommunicationMessageTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
