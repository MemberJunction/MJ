import { Component } from '@angular/core';
import { NU__Product__cEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadNU__Product__cDetailsComponent } from "./sections/details.component"
import { LoadNU__Product__cTopComponent } from "./sections/top.component"

@RegisterClass(BaseFormComponent, 'Products') // Tell MemberJunction about this class
@Component({
    selector: 'gen-nu__product__c-form',
    templateUrl: './nu__product__c.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class NU__Product__cFormComponent extends BaseFormComponent {
    public record!: NU__Product__cEntity;
} 

export function LoadNU__Product__cFormComponent() {
    LoadNU__Product__cDetailsComponent();
    LoadNU__Product__cTopComponent();
}
