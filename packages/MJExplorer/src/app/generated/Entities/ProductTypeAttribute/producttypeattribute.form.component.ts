import { Component } from '@angular/core';
import { ProductTypeAttributeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductTypeAttributeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Product Type Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-producttypeattribute-form',
    templateUrl: './producttypeattribute.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductTypeAttributeFormComponent extends BaseFormComponent {
    public record!: ProductTypeAttributeEntity;
} 

export function LoadProductTypeAttributeFormComponent() {
    LoadProductTypeAttributeDetailsComponent();
}
