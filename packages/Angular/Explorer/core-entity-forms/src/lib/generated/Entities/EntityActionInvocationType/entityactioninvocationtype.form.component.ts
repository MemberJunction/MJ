import { Component } from '@angular/core';
import { EntityActionInvocationTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Entity Action Invocation Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityactioninvocationtype-form',
    templateUrl: './entityactioninvocationtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityActionInvocationTypeFormComponent extends BaseFormComponent {
    public record!: EntityActionInvocationTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        invocationTypeDefinition: true,
        systemMetadata: false,
        entityActionInvocations: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntityActionInvocationTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
