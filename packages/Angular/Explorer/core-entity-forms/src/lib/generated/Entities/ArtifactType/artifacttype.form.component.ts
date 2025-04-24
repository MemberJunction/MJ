import { Component } from '@angular/core';
import { ArtifactTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadArtifactTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Artifact Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-artifacttype-form',
    templateUrl: './artifacttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ArtifactTypeFormComponent extends BaseFormComponent {
    public record!: ArtifactTypeEntity;
} 

export function LoadArtifactTypeFormComponent() {
    LoadArtifactTypeDetailsComponent();
}
