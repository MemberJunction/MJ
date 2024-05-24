import { Component } from '@angular/core';
import { ProductPriceLevelEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductPriceLevelDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Product Price Levels') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productpricelevel-form',
    templateUrl: './productpricelevel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductPriceLevelFormComponent extends BaseFormComponent {
    public record!: ProductPriceLevelEntity;
} 

export function LoadProductPriceLevelFormComponent() {
    LoadProductPriceLevelDetailsComponent();
}
