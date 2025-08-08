import { Component } from '@angular/core';
import { NU__Event__cEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadNU__Event__cDetailsComponent } from "./sections/details.component"
import { LoadNU__Event__cTopComponent } from "./sections/top.component"

@RegisterClass(BaseFormComponent, 'Events') // Tell MemberJunction about this class
@Component({
    selector: 'gen-nu__event__c-form',
    templateUrl: './nu__event__c.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class NU__Event__cFormComponent extends BaseFormComponent {
    public record!: NU__Event__cEntity;
} 

export function LoadNU__Event__cFormComponent() {
    LoadNU__Event__cDetailsComponent();
    LoadNU__Event__cTopComponent();
}
