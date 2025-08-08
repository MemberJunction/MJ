import { Component } from '@angular/core';
import { NU__OrderItem__cEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadNU__OrderItem__cDetailsComponent } from "./sections/details.component"
import { LoadNU__OrderItem__cTopComponent } from "./sections/top.component"

@RegisterClass(BaseFormComponent, 'Order Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-nu__orderitem__c-form',
    templateUrl: './nu__orderitem__c.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class NU__OrderItem__cFormComponent extends BaseFormComponent {
    public record!: NU__OrderItem__cEntity;
} 

export function LoadNU__OrderItem__cFormComponent() {
    LoadNU__OrderItem__cDetailsComponent();
    LoadNU__OrderItem__cTopComponent();
}
