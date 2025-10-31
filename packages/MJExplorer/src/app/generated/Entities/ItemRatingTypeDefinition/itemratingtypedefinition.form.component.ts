import { Component } from '@angular/core';
import { ItemRatingTypeDefinitionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadItemRatingTypeDefinitionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Item Rating Type Definitions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-itemratingtypedefinition-form',
    templateUrl: './itemratingtypedefinition.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ItemRatingTypeDefinitionFormComponent extends BaseFormComponent {
    public record!: ItemRatingTypeDefinitionEntity;
} 

export function LoadItemRatingTypeDefinitionFormComponent() {
    LoadItemRatingTypeDefinitionDetailsComponent();
}
