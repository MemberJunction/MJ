import { Component } from '@angular/core';
import { ArtifactPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Artifact Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-artifactpermission-form',
    templateUrl: './artifactpermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ArtifactPermissionFormComponent extends BaseFormComponent {
    public record!: ArtifactPermissionEntity;

    // Collapsible section state
    public sectionsExpanded = {
        permissionRelationships: true,
        artifactAccessRights: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadArtifactPermissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
