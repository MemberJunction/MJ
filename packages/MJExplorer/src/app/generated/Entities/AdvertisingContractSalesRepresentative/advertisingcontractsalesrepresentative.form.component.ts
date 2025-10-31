import { Component } from '@angular/core';
import { AdvertisingContractSalesRepresentativeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingContractSalesRepresentativeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Advertising Contract Sales Representatives') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingcontractsalesrepresentative-form',
    templateUrl: './advertisingcontractsalesrepresentative.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingContractSalesRepresentativeFormComponent extends BaseFormComponent {
    public record!: AdvertisingContractSalesRepresentativeEntity;
} 

export function LoadAdvertisingContractSalesRepresentativeFormComponent() {
    LoadAdvertisingContractSalesRepresentativeDetailsComponent();
}
