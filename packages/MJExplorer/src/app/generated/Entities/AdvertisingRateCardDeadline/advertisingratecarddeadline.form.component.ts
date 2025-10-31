import { Component } from '@angular/core';
import { AdvertisingRateCardDeadlineEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingRateCardDeadlineDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Advertising Rate Card Deadlines') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingratecarddeadline-form',
    templateUrl: './advertisingratecarddeadline.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingRateCardDeadlineFormComponent extends BaseFormComponent {
    public record!: AdvertisingRateCardDeadlineEntity;
} 

export function LoadAdvertisingRateCardDeadlineFormComponent() {
    LoadAdvertisingRateCardDeadlineDetailsComponent();
}
