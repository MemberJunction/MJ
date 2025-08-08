import { Component } from '@angular/core';
import { NU__Membership__cEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadNU__Membership__cDetailsComponent } from "./sections/details.component"
import { LoadNU__Membership__cTopComponent } from "./sections/top.component"

@RegisterClass(BaseFormComponent, 'Memberships') // Tell MemberJunction about this class
@Component({
    selector: 'gen-nu__membership__c-form',
    templateUrl: './nu__membership__c.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class NU__Membership__cFormComponent extends BaseFormComponent {
    public record!: NU__Membership__cEntity;
} 

export function LoadNU__Membership__cFormComponent() {
    LoadNU__Membership__cDetailsComponent();
    LoadNU__Membership__cTopComponent();
}
