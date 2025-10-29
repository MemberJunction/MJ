import { Component } from '@angular/core';
import { ArtifactUseEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadArtifactUseDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Artifact Uses') // Tell MemberJunction about this class
@Component({
    selector: 'gen-artifactuse-form',
    templateUrl: './artifactuse.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ArtifactUseFormComponent extends BaseFormComponent {
    public record!: ArtifactUseEntity;
} 

export function LoadArtifactUseFormComponent() {
    LoadArtifactUseDetailsComponent();
}
