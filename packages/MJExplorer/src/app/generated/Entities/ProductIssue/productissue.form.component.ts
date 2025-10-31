import { Component } from '@angular/core';
import { ProductIssueEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductIssueDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Product Issues') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productissue-form',
    templateUrl: './productissue.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductIssueFormComponent extends BaseFormComponent {
    public record!: ProductIssueEntity;
} 

export function LoadProductIssueFormComponent() {
    LoadProductIssueDetailsComponent();
}
