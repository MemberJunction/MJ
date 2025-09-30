import { Component } from '@angular/core';
import { ArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadArtifactDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Artifacts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-artifact-form',
    templateUrl: './artifact.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ArtifactFormComponent extends BaseFormComponent {
    public record!: ArtifactEntity;
} 

export function LoadArtifactFormComponent() {
    LoadArtifactDetailsComponent();
}
