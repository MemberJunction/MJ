import { Component } from '@angular/core';
import { ProductHistAvgCostEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductHistAvgCostDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Product Hist Avg Costs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-producthistavgcost-form',
    templateUrl: './producthistavgcost.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductHistAvgCostFormComponent extends BaseFormComponent {
    public record!: ProductHistAvgCostEntity;
} 

export function LoadProductHistAvgCostFormComponent() {
    LoadProductHistAvgCostDetailsComponent();
}
