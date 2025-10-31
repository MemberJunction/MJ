import { Component } from '@angular/core';
import { AddressEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAddressDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Addresses') // Tell MemberJunction about this class
@Component({
    selector: 'gen-address-form',
    templateUrl: './address.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AddressFormComponent extends BaseFormComponent {
    public record!: AddressEntity;
} 

export function LoadAddressFormComponent() {
    LoadAddressDetailsComponent();
}
