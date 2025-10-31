import { Component } from '@angular/core';
import { ProductCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Product Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productcategory-form',
    templateUrl: './productcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductCategoryFormComponent extends BaseFormComponent {
    public record!: ProductCategoryEntity;
} 

export function LoadProductCategoryFormComponent() {
    LoadProductCategoryDetailsComponent();
}
