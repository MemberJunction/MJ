import { Component } from '@angular/core';
import { AdvertisingRateCardRateEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingRateCardRateDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Advertising Rate Card Rates') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingratecardrate-form',
    templateUrl: './advertisingratecardrate.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingRateCardRateFormComponent extends BaseFormComponent {
    public record!: AdvertisingRateCardRateEntity;
} 

export function LoadAdvertisingRateCardRateFormComponent() {
    LoadAdvertisingRateCardRateDetailsComponent();
}
