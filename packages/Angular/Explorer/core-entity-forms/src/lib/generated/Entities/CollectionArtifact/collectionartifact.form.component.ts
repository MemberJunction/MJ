import { Component } from '@angular/core';
import { CollectionArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCollectionArtifactDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Collection Artifacts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-collectionartifact-form',
    templateUrl: './collectionartifact.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CollectionArtifactFormComponent extends BaseFormComponent {
    public record!: CollectionArtifactEntity;
} 

export function LoadCollectionArtifactFormComponent() {
    LoadCollectionArtifactDetailsComponent();
}
