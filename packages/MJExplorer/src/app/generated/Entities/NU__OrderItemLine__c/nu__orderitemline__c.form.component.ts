import { Component } from '@angular/core';
import { NU__OrderItemLine__cEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadNU__OrderItemLine__cDetailsComponent } from "./sections/details.component"
import { LoadNU__OrderItemLine__cTopComponent } from "./sections/top.component"

@RegisterClass(BaseFormComponent, 'Order Item Lines') // Tell MemberJunction about this class
@Component({
    selector: 'gen-nu__orderitemline__c-form',
    templateUrl: './nu__orderitemline__c.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class NU__OrderItemLine__cFormComponent extends BaseFormComponent {
    public record!: NU__OrderItemLine__cEntity;
} 

export function LoadNU__OrderItemLine__cFormComponent() {
    LoadNU__OrderItemLine__cDetailsComponent();
    LoadNU__OrderItemLine__cTopComponent();
}
