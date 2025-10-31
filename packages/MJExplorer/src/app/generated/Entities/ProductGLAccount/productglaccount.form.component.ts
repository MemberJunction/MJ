import { Component } from '@angular/core';
import { ProductGLAccountEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductGLAccountDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Product GL Accounts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productglaccount-form',
    templateUrl: './productglaccount.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductGLAccountFormComponent extends BaseFormComponent {
    public record!: ProductGLAccountEntity;
} 

export function LoadProductGLAccountFormComponent() {
    LoadProductGLAccountDetailsComponent();
}
