import { Component } from '@angular/core';
import { EntityDocumentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Entity Document Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitydocumenttype-form',
    templateUrl: './entitydocumenttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityDocumentTypeFormComponent extends BaseFormComponent {
    public record!: EntityDocumentTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        entityDocuments: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntityDocumentTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
