import { Component } from '@angular/core';
import { ProductCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductCodeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Product Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productcode-form',
    templateUrl: './productcode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductCodeFormComponent extends BaseFormComponent {
    public record!: ProductCodeEntity;
} 

export function LoadProductCodeFormComponent() {
    LoadProductCodeDetailsComponent();
}
