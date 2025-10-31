import { Component } from '@angular/core';
import { ProductCostDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductCostDetailDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Product Cost Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productcostdetail-form',
    templateUrl: './productcostdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductCostDetailFormComponent extends BaseFormComponent {
    public record!: ProductCostDetailEntity;
} 

export function LoadProductCostDetailFormComponent() {
    LoadProductCostDetailDetailsComponent();
}
