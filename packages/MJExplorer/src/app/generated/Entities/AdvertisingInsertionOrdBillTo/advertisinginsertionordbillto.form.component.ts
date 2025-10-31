import { Component } from '@angular/core';
import { AdvertisingInsertionOrdBillToEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingInsertionOrdBillToDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Advertising Insertion Ord Bill Tos') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisinginsertionordbillto-form',
    templateUrl: './advertisinginsertionordbillto.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingInsertionOrdBillToFormComponent extends BaseFormComponent {
    public record!: AdvertisingInsertionOrdBillToEntity;
} 

export function LoadAdvertisingInsertionOrdBillToFormComponent() {
    LoadAdvertisingInsertionOrdBillToDetailsComponent();
}
