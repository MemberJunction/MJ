import { Component } from '@angular/core';
import { ArtifactPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadArtifactPermissionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Artifact Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-artifactpermission-form',
    templateUrl: './artifactpermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ArtifactPermissionFormComponent extends BaseFormComponent {
    public record!: ArtifactPermissionEntity;
} 

export function LoadArtifactPermissionFormComponent() {
    LoadArtifactPermissionDetailsComponent();
}
