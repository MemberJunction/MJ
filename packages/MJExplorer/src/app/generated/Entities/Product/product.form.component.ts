import { Component } from '@angular/core';
import { ProductEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Products') // Tell MemberJunction about this class
@Component({
    selector: 'gen-product-form',
    templateUrl: './product.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductFormComponent extends BaseFormComponent {
    public record!: ProductEntity;
} 

export function LoadProductFormComponent() {
    LoadProductDetailsComponent();
}
