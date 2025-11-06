import { Component } from '@angular/core';
import { EntityPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitypermission-form',
    templateUrl: './entitypermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityPermissionFormComponent extends BaseFormComponent {
    public record!: EntityPermissionEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntityPermissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
