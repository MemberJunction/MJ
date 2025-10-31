import { Component } from '@angular/core';
import { ItemRatingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadItemRatingDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Item Ratings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-itemrating-form',
    templateUrl: './itemrating.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ItemRatingFormComponent extends BaseFormComponent {
    public record!: ItemRatingEntity;
} 

export function LoadItemRatingFormComponent() {
    LoadItemRatingDetailsComponent();
}
