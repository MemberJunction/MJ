import { Component } from '@angular/core';
import { AccountingPeriodEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAccountingPeriodDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Accounting Periods') // Tell MemberJunction about this class
@Component({
    selector: 'gen-accountingperiod-form',
    templateUrl: './accountingperiod.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AccountingPeriodFormComponent extends BaseFormComponent {
    public record!: AccountingPeriodEntity;
} 

export function LoadAccountingPeriodFormComponent() {
    LoadAccountingPeriodDetailsComponent();
}
