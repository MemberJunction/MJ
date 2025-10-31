import { Component } from '@angular/core';
import { ProductCostTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductCostTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Product Cost Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productcosttype-form',
    templateUrl: './productcosttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductCostTypeFormComponent extends BaseFormComponent {
    public record!: ProductCostTypeEntity;
} 

export function LoadProductCostTypeFormComponent() {
    LoadProductCostTypeDetailsComponent();
}
