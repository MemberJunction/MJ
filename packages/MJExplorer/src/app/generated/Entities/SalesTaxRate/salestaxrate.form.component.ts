import { Component } from '@angular/core';
import { SalesTaxRateEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSalesTaxRateDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Sales Tax Rates') // Tell MemberJunction about this class
@Component({
    selector: 'gen-salestaxrate-form',
    templateUrl: './salestaxrate.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SalesTaxRateFormComponent extends BaseFormComponent {
    public record!: SalesTaxRateEntity;
} 

export function LoadSalesTaxRateFormComponent() {
    LoadSalesTaxRateDetailsComponent();
}
