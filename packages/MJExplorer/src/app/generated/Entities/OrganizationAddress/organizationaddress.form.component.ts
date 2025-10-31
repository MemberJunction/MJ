import { Component } from '@angular/core';
import { OrganizationAddressEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrganizationAddressDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Organization Addresses') // Tell MemberJunction about this class
@Component({
    selector: 'gen-organizationaddress-form',
    templateUrl: './organizationaddress.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrganizationAddressFormComponent extends BaseFormComponent {
    public record!: OrganizationAddressEntity;
} 

export function LoadOrganizationAddressFormComponent() {
    LoadOrganizationAddressDetailsComponent();
}
