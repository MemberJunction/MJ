import { Component } from '@angular/core';
import { AdvertisingInsertionOrdSalesRepEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingInsertionOrdSalesRepDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Advertising Insertion Ord Sales Reps') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisinginsertionordsalesrep-form',
    templateUrl: './advertisinginsertionordsalesrep.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingInsertionOrdSalesRepFormComponent extends BaseFormComponent {
    public record!: AdvertisingInsertionOrdSalesRepEntity;
} 

export function LoadAdvertisingInsertionOrdSalesRepFormComponent() {
    LoadAdvertisingInsertionOrdSalesRepDetailsComponent();
}
