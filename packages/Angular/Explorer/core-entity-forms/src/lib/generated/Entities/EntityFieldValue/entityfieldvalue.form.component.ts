import { Component } from '@angular/core';
import { EntityFieldValueEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Field Values') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityfieldvalue-form',
    templateUrl: './entityfieldvalue.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityFieldValueFormComponent extends BaseFormComponent {
    public record!: EntityFieldValueEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntityFieldValueFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
