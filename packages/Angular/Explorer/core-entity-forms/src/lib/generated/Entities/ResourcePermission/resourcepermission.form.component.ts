import { Component } from '@angular/core';
import { ResourcePermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Resource Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resourcepermission-form',
    templateUrl: './resourcepermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ResourcePermissionFormComponent extends BaseFormComponent {
    public record!: ResourcePermissionEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadResourcePermissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
