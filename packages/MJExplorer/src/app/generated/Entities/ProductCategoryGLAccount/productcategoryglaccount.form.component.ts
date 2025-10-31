import { Component } from '@angular/core';
import { ProductCategoryGLAccountEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductCategoryGLAccountDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Product Category GL Accounts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productcategoryglaccount-form',
    templateUrl: './productcategoryglaccount.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductCategoryGLAccountFormComponent extends BaseFormComponent {
    public record!: ProductCategoryGLAccountEntity;
} 

export function LoadProductCategoryGLAccountFormComponent() {
    LoadProductCategoryGLAccountDetailsComponent();
}
