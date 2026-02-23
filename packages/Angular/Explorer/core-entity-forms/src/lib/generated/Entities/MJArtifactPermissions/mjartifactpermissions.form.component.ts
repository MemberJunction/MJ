import { Component } from '@angular/core';
import { MJArtifactPermissionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Artifact Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjartifactpermissions-form',
    templateUrl: './mjartifactpermissions.form.component.html'
})
export class MJArtifactPermissionsFormComponent extends BaseFormComponent {
    public record!: MJArtifactPermissionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'permissionRelationships', sectionName: 'Permission Relationships', isExpanded: true },
            { sectionKey: 'artifactAccessRights', sectionName: 'Artifact Access Rights', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

