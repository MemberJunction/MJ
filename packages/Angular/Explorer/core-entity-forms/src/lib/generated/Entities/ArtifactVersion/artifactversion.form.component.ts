import { Component } from '@angular/core';
import { ArtifactVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadArtifactVersionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Artifact Versions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-artifactversion-form',
    templateUrl: './artifactversion.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ArtifactVersionFormComponent extends BaseFormComponent {
    public record!: ArtifactVersionEntity;
} 

export function LoadArtifactVersionFormComponent() {
    LoadArtifactVersionDetailsComponent();
}
