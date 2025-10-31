import { Component } from '@angular/core';
import { OrderCurrencySpotRateEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderCurrencySpotRateDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Order Currency Spot Rates') // Tell MemberJunction about this class
@Component({
    selector: 'gen-ordercurrencyspotrate-form',
    templateUrl: './ordercurrencyspotrate.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderCurrencySpotRateFormComponent extends BaseFormComponent {
    public record!: OrderCurrencySpotRateEntity;
} 

export function LoadOrderCurrencySpotRateFormComponent() {
    LoadOrderCurrencySpotRateDetailsComponent();
}
