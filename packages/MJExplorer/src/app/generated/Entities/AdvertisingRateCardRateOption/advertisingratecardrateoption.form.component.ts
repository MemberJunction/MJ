import { Component } from '@angular/core';
import { AdvertisingRateCardRateOptionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingRateCardRateOptionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Advertising Rate Card Rate Options') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingratecardrateoption-form',
    templateUrl: './advertisingratecardrateoption.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingRateCardRateOptionFormComponent extends BaseFormComponent {
    public record!: AdvertisingRateCardRateOptionEntity;
} 

export function LoadAdvertisingRateCardRateOptionFormComponent() {
    LoadAdvertisingRateCardRateOptionDetailsComponent();
}
