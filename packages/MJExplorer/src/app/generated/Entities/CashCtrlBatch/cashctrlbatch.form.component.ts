import { Component } from '@angular/core';
import { CashCtrlBatchEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCashCtrlBatchDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Cash Ctrl Batches') // Tell MemberJunction about this class
@Component({
    selector: 'gen-cashctrlbatch-form',
    templateUrl: './cashctrlbatch.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CashCtrlBatchFormComponent extends BaseFormComponent {
    public record!: CashCtrlBatchEntity;
} 

export function LoadCashCtrlBatchFormComponent() {
    LoadCashCtrlBatchDetailsComponent();
}
