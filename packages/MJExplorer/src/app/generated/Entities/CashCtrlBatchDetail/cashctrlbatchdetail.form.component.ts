import { Component } from '@angular/core';
import { CashCtrlBatchDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCashCtrlBatchDetailDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Cash Ctrl Batch Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-cashctrlbatchdetail-form',
    templateUrl: './cashctrlbatchdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CashCtrlBatchDetailFormComponent extends BaseFormComponent {
    public record!: CashCtrlBatchDetailEntity;
} 

export function LoadCashCtrlBatchDetailFormComponent() {
    LoadCashCtrlBatchDetailDetailsComponent();
}
