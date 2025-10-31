import { Component } from '@angular/core';
import { ProductAttributeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductAttributeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Product Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productattribute-form',
    templateUrl: './productattribute.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductAttributeFormComponent extends BaseFormComponent {
    public record!: ProductAttributeEntity;
} 

export function LoadProductAttributeFormComponent() {
    LoadProductAttributeDetailsComponent();
}
