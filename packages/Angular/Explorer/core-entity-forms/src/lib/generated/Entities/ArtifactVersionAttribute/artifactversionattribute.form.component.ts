import { Component } from '@angular/core';
import { ArtifactVersionAttributeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadArtifactVersionAttributeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Artifact Version Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-artifactversionattribute-form',
    templateUrl: './artifactversionattribute.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ArtifactVersionAttributeFormComponent extends BaseFormComponent {
    public record!: ArtifactVersionAttributeEntity;
} 

export function LoadArtifactVersionAttributeFormComponent() {
    LoadArtifactVersionAttributeDetailsComponent();
}
