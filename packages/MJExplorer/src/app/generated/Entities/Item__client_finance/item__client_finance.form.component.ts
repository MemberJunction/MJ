import { Component } from '@angular/core';
import { Item__client_financeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadItem__client_financeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Items__client_finance') // Tell MemberJunction about this class
@Component({
    selector: 'gen-item__client_finance-form',
    templateUrl: './item__client_finance.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Item__client_financeFormComponent extends BaseFormComponent {
    public record!: Item__client_financeEntity;
} 

export function LoadItem__client_financeFormComponent() {
    LoadItem__client_financeDetailsComponent();
}
