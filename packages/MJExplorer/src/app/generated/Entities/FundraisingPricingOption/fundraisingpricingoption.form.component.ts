import { Component } from '@angular/core';
import { FundraisingPricingOptionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFundraisingPricingOptionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Fundraising Pricing Options') // Tell MemberJunction about this class
@Component({
    selector: 'gen-fundraisingpricingoption-form',
    templateUrl: './fundraisingpricingoption.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FundraisingPricingOptionFormComponent extends BaseFormComponent {
    public record!: FundraisingPricingOptionEntity;
} 

export function LoadFundraisingPricingOptionFormComponent() {
    LoadFundraisingPricingOptionDetailsComponent();
}
