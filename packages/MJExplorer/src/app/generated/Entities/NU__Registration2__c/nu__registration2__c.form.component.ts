import { Component } from '@angular/core';
import { NU__Registration2__cEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadNU__Registration2__cDetailsComponent } from "./sections/details.component"
import { LoadNU__Registration2__cTopComponent } from "./sections/top.component"

@RegisterClass(BaseFormComponent, 'Registrations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-nu__registration2__c-form',
    templateUrl: './nu__registration2__c.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class NU__Registration2__cFormComponent extends BaseFormComponent {
    public record!: NU__Registration2__cEntity;
} 

export function LoadNU__Registration2__cFormComponent() {
    LoadNU__Registration2__cDetailsComponent();
    LoadNU__Registration2__cTopComponent();
}
