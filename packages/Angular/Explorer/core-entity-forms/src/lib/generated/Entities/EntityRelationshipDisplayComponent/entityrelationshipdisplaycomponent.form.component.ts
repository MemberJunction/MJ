import { Component } from '@angular/core';
import { EntityRelationshipDisplayComponentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Entity Relationship Display Components') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityrelationshipdisplaycomponent-form',
    templateUrl: './entityrelationshipdisplaycomponent.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityRelationshipDisplayComponentFormComponent extends BaseFormComponent {
    public record!: EntityRelationshipDisplayComponentEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        entityRelationships: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntityRelationshipDisplayComponentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
