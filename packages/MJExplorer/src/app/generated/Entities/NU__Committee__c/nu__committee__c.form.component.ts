import { Component } from '@angular/core';
import { NU__Committee__cEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadNU__Committee__cDetailsComponent } from "./sections/details.component"
import { LoadNU__Committee__cTopComponent } from "./sections/top.component"

@RegisterClass(BaseFormComponent, 'Committees') // Tell MemberJunction about this class
@Component({
    selector: 'gen-nu__committee__c-form',
    templateUrl: './nu__committee__c.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class NU__Committee__cFormComponent extends BaseFormComponent {
    public record!: NU__Committee__cEntity;
} 

export function LoadNU__Committee__cFormComponent() {
    LoadNU__Committee__cDetailsComponent();
    LoadNU__Committee__cTopComponent();
}
