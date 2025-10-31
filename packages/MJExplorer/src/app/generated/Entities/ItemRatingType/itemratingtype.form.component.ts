import { Component } from '@angular/core';
import { ItemRatingTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadItemRatingTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Item Rating Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-itemratingtype-form',
    templateUrl: './itemratingtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ItemRatingTypeFormComponent extends BaseFormComponent {
    public record!: ItemRatingTypeEntity;
} 

export function LoadItemRatingTypeFormComponent() {
    LoadItemRatingTypeDetailsComponent();
}
