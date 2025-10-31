import { Component } from '@angular/core';
import { AdvertisingContractPublicationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingContractPublicationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Advertising Contract Publications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingcontractpublication-form',
    templateUrl: './advertisingcontractpublication.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingContractPublicationFormComponent extends BaseFormComponent {
    public record!: AdvertisingContractPublicationEntity;
} 

export function LoadAdvertisingContractPublicationFormComponent() {
    LoadAdvertisingContractPublicationDetailsComponent();
}
