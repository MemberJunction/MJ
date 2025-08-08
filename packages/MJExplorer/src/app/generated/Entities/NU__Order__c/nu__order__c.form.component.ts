import { Component } from '@angular/core';
import { NU__Order__cEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadNU__Order__cDetailsComponent } from "./sections/details.component"
import { LoadNU__Order__cTopComponent } from "./sections/top.component"

@RegisterClass(BaseFormComponent, 'Orders') // Tell MemberJunction about this class
@Component({
    selector: 'gen-nu__order__c-form',
    templateUrl: './nu__order__c.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class NU__Order__cFormComponent extends BaseFormComponent {
    public record!: NU__Order__cEntity;
} 

export function LoadNU__Order__cFormComponent() {
    LoadNU__Order__cDetailsComponent();
    LoadNU__Order__cTopComponent();
}
