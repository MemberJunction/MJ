import { Component } from '@angular/core';
import { AddressTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAddressTypeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Address Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-addresstype-form',
    templateUrl: './addresstype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AddressTypeFormComponent extends BaseFormComponent {
    public record!: AddressTypeEntity;
} 

export function LoadAddressTypeFormComponent() {
    LoadAddressTypeDetailsComponent();
}
