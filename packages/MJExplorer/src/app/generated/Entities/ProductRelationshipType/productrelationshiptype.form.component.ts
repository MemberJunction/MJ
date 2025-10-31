import { Component } from '@angular/core';
import { ProductRelationshipTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductRelationshipTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Product Relationship Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productrelationshiptype-form',
    templateUrl: './productrelationshiptype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductRelationshipTypeFormComponent extends BaseFormComponent {
    public record!: ProductRelationshipTypeEntity;
} 

export function LoadProductRelationshipTypeFormComponent() {
    LoadProductRelationshipTypeDetailsComponent();
}
