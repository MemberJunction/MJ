import { Component } from '@angular/core';
import { CurrencySpotRateEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCurrencySpotRateDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Currency Spot Rates') // Tell MemberJunction about this class
@Component({
    selector: 'gen-currencyspotrate-form',
    templateUrl: './currencyspotrate.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CurrencySpotRateFormComponent extends BaseFormComponent {
    public record!: CurrencySpotRateEntity;
} 

export function LoadCurrencySpotRateFormComponent() {
    LoadCurrencySpotRateDetailsComponent();
}
