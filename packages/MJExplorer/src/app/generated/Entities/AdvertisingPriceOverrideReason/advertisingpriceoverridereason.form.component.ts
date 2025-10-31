import { Component } from '@angular/core';
import { AdvertisingPriceOverrideReasonEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingPriceOverrideReasonDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Advertising Price Override Reasons') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingpriceoverridereason-form',
    templateUrl: './advertisingpriceoverridereason.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingPriceOverrideReasonFormComponent extends BaseFormComponent {
    public record!: AdvertisingPriceOverrideReasonEntity;
} 

export function LoadAdvertisingPriceOverrideReasonFormComponent() {
    LoadAdvertisingPriceOverrideReasonDetailsComponent();
}
