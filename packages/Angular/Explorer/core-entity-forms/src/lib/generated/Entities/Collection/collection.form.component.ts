import { Component } from '@angular/core';
import { CollectionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCollectionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Collections') // Tell MemberJunction about this class
@Component({
    selector: 'gen-collection-form',
    templateUrl: './collection.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CollectionFormComponent extends BaseFormComponent {
    public record!: CollectionEntity;
} 

export function LoadCollectionFormComponent() {
    LoadCollectionDetailsComponent();
}
