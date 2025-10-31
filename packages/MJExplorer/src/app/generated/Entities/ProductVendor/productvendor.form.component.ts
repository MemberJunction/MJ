import { Component } from '@angular/core';
import { ProductVendorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductVendorDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Product Vendors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productvendor-form',
    templateUrl: './productvendor.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductVendorFormComponent extends BaseFormComponent {
    public record!: ProductVendorEntity;
} 

export function LoadProductVendorFormComponent() {
    LoadProductVendorDetailsComponent();
}
