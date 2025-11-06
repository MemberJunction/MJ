import { Component } from '@angular/core';
import { CollectionPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Collection Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-collectionpermission-form',
    templateUrl: './collectionpermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CollectionPermissionFormComponent extends BaseFormComponent {
    public record!: CollectionPermissionEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadCollectionPermissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
