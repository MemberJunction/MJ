import { Component } from '@angular/core';
import { MJCollectionPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Collection Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcollectionpermission-form',
    templateUrl: './mjcollectionpermission.form.component.html'
})
export class MJCollectionPermissionFormComponent extends BaseFormComponent {
    public record!: MJCollectionPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sharingRelationships', sectionName: 'Sharing Relationships', isExpanded: true },
            { sectionKey: 'permissionSettings', sectionName: 'Permission Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

