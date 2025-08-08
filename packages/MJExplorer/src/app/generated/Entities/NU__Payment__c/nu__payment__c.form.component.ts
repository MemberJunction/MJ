import { Component } from '@angular/core';
import { NU__Payment__cEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadNU__Payment__cDetailsComponent } from "./sections/details.component"
import { LoadNU__Payment__cTopComponent } from "./sections/top.component"

@RegisterClass(BaseFormComponent, 'Payments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-nu__payment__c-form',
    templateUrl: './nu__payment__c.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class NU__Payment__cFormComponent extends BaseFormComponent {
    public record!: NU__Payment__cEntity;
} 

export function LoadNU__Payment__cFormComponent() {
    LoadNU__Payment__cDetailsComponent();
    LoadNU__Payment__cTopComponent();
}
