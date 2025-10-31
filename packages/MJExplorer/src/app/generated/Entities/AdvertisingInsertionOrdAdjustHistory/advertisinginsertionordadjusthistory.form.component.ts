import { Component } from '@angular/core';
import { AdvertisingInsertionOrdAdjustHistoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingInsertionOrdAdjustHistoryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Advertising Insertion Ord Adjust Histories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisinginsertionordadjusthistory-form',
    templateUrl: './advertisinginsertionordadjusthistory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingInsertionOrdAdjustHistoryFormComponent extends BaseFormComponent {
    public record!: AdvertisingInsertionOrdAdjustHistoryEntity;
} 

export function LoadAdvertisingInsertionOrdAdjustHistoryFormComponent() {
    LoadAdvertisingInsertionOrdAdjustHistoryDetailsComponent();
}
