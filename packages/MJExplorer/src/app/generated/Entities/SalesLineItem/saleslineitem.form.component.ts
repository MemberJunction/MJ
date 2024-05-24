import { Component } from '@angular/core';
import { SalesLineItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSalesLineItemDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Sales Line Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-saleslineitem-form',
    templateUrl: './saleslineitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SalesLineItemFormComponent extends BaseFormComponent {
    public record!: SalesLineItemEntity;
} 

export function LoadSalesLineItemFormComponent() {
    LoadSalesLineItemDetailsComponent();
}
