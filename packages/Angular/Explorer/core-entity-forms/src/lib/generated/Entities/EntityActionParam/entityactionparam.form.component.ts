import { Component } from '@angular/core';
import { EntityActionParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Action Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityactionparam-form',
    templateUrl: './entityactionparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityActionParamFormComponent extends BaseFormComponent {
    public record!: EntityActionParamEntity;

    // Collapsible section state
    public sectionsExpanded = {
        identifierRelationships: true,
        parameterDefinition: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntityActionParamFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
