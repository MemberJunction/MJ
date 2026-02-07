import { Component } from '@angular/core';
import { CollectionPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Collection Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-collectionpermission-form',
    templateUrl: './collectionpermission.form.component.html'
})
export class CollectionPermissionFormComponent extends BaseFormComponent {
    public record!: CollectionPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sharingRelationships', sectionName: 'Sharing Relationships', isExpanded: true },
            { sectionKey: 'permissionSettings', sectionName: 'Permission Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadCollectionPermissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
