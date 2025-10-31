import { Component } from '@angular/core';
import { CurrencyTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCurrencyTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Currency Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-currencytype-form',
    templateUrl: './currencytype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CurrencyTypeFormComponent extends BaseFormComponent {
    public record!: CurrencyTypeEntity;
} 

export function LoadCurrencyTypeFormComponent() {
    LoadCurrencyTypeDetailsComponent();
}
