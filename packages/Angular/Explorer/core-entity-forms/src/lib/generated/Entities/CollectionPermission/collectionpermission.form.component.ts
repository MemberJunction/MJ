import { Component } from '@angular/core';
import { CollectionPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCollectionPermissionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Collection Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-collectionpermission-form',
    templateUrl: './collectionpermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CollectionPermissionFormComponent extends BaseFormComponent {
    public record!: CollectionPermissionEntity;
} 

export function LoadCollectionPermissionFormComponent() {
    LoadCollectionPermissionDetailsComponent();
}
