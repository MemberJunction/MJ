import { Component } from '@angular/core';
import { EntityCommunicationFieldEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Communication Fields') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitycommunicationfield-form',
    templateUrl: './entitycommunicationfield.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityCommunicationFieldFormComponent extends BaseFormComponent {
    public record!: EntityCommunicationFieldEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntityCommunicationFieldFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
