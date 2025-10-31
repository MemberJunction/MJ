import { Component } from '@angular/core';
import { ProductTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Product Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-producttype-form',
    templateUrl: './producttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductTypeFormComponent extends BaseFormComponent {
    public record!: ProductTypeEntity;
} 

export function LoadProductTypeFormComponent() {
    LoadProductTypeDetailsComponent();
}
