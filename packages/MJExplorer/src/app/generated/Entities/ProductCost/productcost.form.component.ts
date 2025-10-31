import { Component } from '@angular/core';
import { ProductCostEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductCostDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Product Costs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productcost-form',
    templateUrl: './productcost.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductCostFormComponent extends BaseFormComponent {
    public record!: ProductCostEntity;
} 

export function LoadProductCostFormComponent() {
    LoadProductCostDetailsComponent();
}
