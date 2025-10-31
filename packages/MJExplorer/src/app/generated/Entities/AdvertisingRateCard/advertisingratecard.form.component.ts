import { Component } from '@angular/core';
import { AdvertisingRateCardEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingRateCardDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Advertising Rate Cards') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingratecard-form',
    templateUrl: './advertisingratecard.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingRateCardFormComponent extends BaseFormComponent {
    public record!: AdvertisingRateCardEntity;
} 

export function LoadAdvertisingRateCardFormComponent() {
    LoadAdvertisingRateCardDetailsComponent();
}
