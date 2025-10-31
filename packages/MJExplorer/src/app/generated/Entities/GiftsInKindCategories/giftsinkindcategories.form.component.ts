import { Component } from '@angular/core';
import { GiftsInKindCategoriesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGiftsInKindCategoriesDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Gifts In Kind Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-giftsinkindcategories-form',
    templateUrl: './giftsinkindcategories.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GiftsInKindCategoriesFormComponent extends BaseFormComponent {
    public record!: GiftsInKindCategoriesEntity;
} 

export function LoadGiftsInKindCategoriesFormComponent() {
    LoadGiftsInKindCategoriesDetailsComponent();
}
