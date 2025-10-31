import { Component } from '@angular/core';
import { AdvertisingContractEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingContractDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Advertising Contracts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingcontract-form',
    templateUrl: './advertisingcontract.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingContractFormComponent extends BaseFormComponent {
    public record!: AdvertisingContractEntity;
} 

export function LoadAdvertisingContractFormComponent() {
    LoadAdvertisingContractDetailsComponent();
}
