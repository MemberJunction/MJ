import { Component } from '@angular/core';
import { ProductKitTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductKitTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Product Kit Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productkittype-form',
    templateUrl: './productkittype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductKitTypeFormComponent extends BaseFormComponent {
    public record!: ProductKitTypeEntity;
} 

export function LoadProductKitTypeFormComponent() {
    LoadProductKitTypeDetailsComponent();
}
