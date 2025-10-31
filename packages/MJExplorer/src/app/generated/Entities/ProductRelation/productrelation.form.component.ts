import { Component } from '@angular/core';
import { ProductRelationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductRelationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Product Relations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productrelation-form',
    templateUrl: './productrelation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductRelationFormComponent extends BaseFormComponent {
    public record!: ProductRelationEntity;
} 

export function LoadProductRelationFormComponent() {
    LoadProductRelationDetailsComponent();
}
