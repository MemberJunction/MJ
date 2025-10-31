import { Component } from '@angular/core';
import { AdvertisingRateCardRateSectionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingRateCardRateSectionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Advertising Rate Card Rate Sections') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingratecardratesection-form',
    templateUrl: './advertisingratecardratesection.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingRateCardRateSectionFormComponent extends BaseFormComponent {
    public record!: AdvertisingRateCardRateSectionEntity;
} 

export function LoadAdvertisingRateCardRateSectionFormComponent() {
    LoadAdvertisingRateCardRateSectionDetailsComponent();
}
