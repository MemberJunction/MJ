import { Component } from '@angular/core';
import { EntityDocumentRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Document Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitydocumentrun-form',
    templateUrl: './entitydocumentrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityDocumentRunFormComponent extends BaseFormComponent {
    public record!: EntityDocumentRunEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntityDocumentRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
