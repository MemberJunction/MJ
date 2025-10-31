import { Component } from '@angular/core';
import { ProductPriceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductPriceDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Product Prices') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productprice-form',
    templateUrl: './productprice.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductPriceFormComponent extends BaseFormComponent {
    public record!: ProductPriceEntity;
} 

export function LoadProductPriceFormComponent() {
    LoadProductPriceDetailsComponent();
}
