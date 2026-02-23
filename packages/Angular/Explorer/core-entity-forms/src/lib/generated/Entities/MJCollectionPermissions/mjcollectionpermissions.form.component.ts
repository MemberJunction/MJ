import { Component } from '@angular/core';
import { MJCollectionPermissionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Collection Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcollectionpermissions-form',
    templateUrl: './mjcollectionpermissions.form.component.html'
})
export class MJCollectionPermissionsFormComponent extends BaseFormComponent {
    public record!: MJCollectionPermissionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sharingRelationships', sectionName: 'Sharing Relationships', isExpanded: true },
            { sectionKey: 'permissionSettings', sectionName: 'Permission Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

