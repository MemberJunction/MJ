import { Component } from '@angular/core';
import { NU__Affiliation__cEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadNU__Affiliation__cDetailsComponent } from "./sections/details.component"
import { LoadNU__Affiliation__cTopComponent } from "./sections/top.component"

@RegisterClass(BaseFormComponent, 'Affiliations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-nu__affiliation__c-form',
    templateUrl: './nu__affiliation__c.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class NU__Affiliation__cFormComponent extends BaseFormComponent {
    public record!: NU__Affiliation__cEntity;
} 

export function LoadNU__Affiliation__cFormComponent() {
    LoadNU__Affiliation__cDetailsComponent();
    LoadNU__Affiliation__cTopComponent();
}
