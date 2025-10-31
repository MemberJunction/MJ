import { Component } from '@angular/core';
import { CashCtrlBatchDetailAllocEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCashCtrlBatchDetailAllocDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Cash Ctrl Batch Detail Allocs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-cashctrlbatchdetailalloc-form',
    templateUrl: './cashctrlbatchdetailalloc.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CashCtrlBatchDetailAllocFormComponent extends BaseFormComponent {
    public record!: CashCtrlBatchDetailAllocEntity;
} 

export function LoadCashCtrlBatchDetailAllocFormComponent() {
    LoadCashCtrlBatchDetailAllocDetailsComponent();
}
