import { Component } from '@angular/core';
import { CompanySavedPaymentMethodEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanySavedPaymentMethodDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Company Saved Payment Methods') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companysavedpaymentmethod-form',
    templateUrl: './companysavedpaymentmethod.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanySavedPaymentMethodFormComponent extends BaseFormComponent {
    public record!: CompanySavedPaymentMethodEntity;
} 

export function LoadCompanySavedPaymentMethodFormComponent() {
    LoadCompanySavedPaymentMethodDetailsComponent();
}
