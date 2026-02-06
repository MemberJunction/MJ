import { Component } from '@angular/core';
import { ArtifactPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Artifact Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-artifactpermission-form',
    templateUrl: './artifactpermission.form.component.html'
})
export class ArtifactPermissionFormComponent extends BaseFormComponent {
    public record!: ArtifactPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'permissionRelationships', sectionName: 'Permission Relationships', isExpanded: true },
            { sectionKey: 'artifactAccessRights', sectionName: 'Artifact Access Rights', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadArtifactPermissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
