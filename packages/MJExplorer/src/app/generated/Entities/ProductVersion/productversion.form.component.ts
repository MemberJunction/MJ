import { Component } from '@angular/core';
import { ProductVersionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductVersionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Product Versions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productversion-form',
    templateUrl: './productversion.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductVersionFormComponent extends BaseFormComponent {
    public record!: ProductVersionEntity;
} 

export function LoadProductVersionFormComponent() {
    LoadProductVersionDetailsComponent();
}
