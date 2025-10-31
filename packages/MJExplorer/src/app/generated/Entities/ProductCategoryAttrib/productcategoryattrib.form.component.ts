import { Component } from '@angular/core';
import { ProductCategoryAttribEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductCategoryAttribDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Product Category Attribs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productcategoryattrib-form',
    templateUrl: './productcategoryattrib.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductCategoryAttribFormComponent extends BaseFormComponent {
    public record!: ProductCategoryAttribEntity;
} 

export function LoadProductCategoryAttribFormComponent() {
    LoadProductCategoryAttribDetailsComponent();
}
