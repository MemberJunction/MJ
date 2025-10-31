import { Component } from '@angular/core';
import { ProductWebTemplateEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductWebTemplateDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Product Web Templates') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productwebtemplate-form',
    templateUrl: './productwebtemplate.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductWebTemplateFormComponent extends BaseFormComponent {
    public record!: ProductWebTemplateEntity;
} 

export function LoadProductWebTemplateFormComponent() {
    LoadProductWebTemplateDetailsComponent();
}
