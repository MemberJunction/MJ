import { Component } from '@angular/core';
import { CreditCardTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCreditCardTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Credit Card Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-creditcardtype-form',
    templateUrl: './creditcardtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CreditCardTypeFormComponent extends BaseFormComponent {
    public record!: CreditCardTypeEntity;
} 

export function LoadCreditCardTypeFormComponent() {
    LoadCreditCardTypeDetailsComponent();
}
