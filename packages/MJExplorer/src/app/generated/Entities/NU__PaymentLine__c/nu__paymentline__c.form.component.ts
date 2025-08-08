import { Component } from '@angular/core';
import { NU__PaymentLine__cEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadNU__PaymentLine__cDetailsComponent } from "./sections/details.component"
import { LoadNU__PaymentLine__cTopComponent } from "./sections/top.component"

@RegisterClass(BaseFormComponent, 'Payment Lines') // Tell MemberJunction about this class
@Component({
    selector: 'gen-nu__paymentline__c-form',
    templateUrl: './nu__paymentline__c.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class NU__PaymentLine__cFormComponent extends BaseFormComponent {
    public record!: NU__PaymentLine__cEntity;
} 

export function LoadNU__PaymentLine__cFormComponent() {
    LoadNU__PaymentLine__cDetailsComponent();
    LoadNU__PaymentLine__cTopComponent();
}
