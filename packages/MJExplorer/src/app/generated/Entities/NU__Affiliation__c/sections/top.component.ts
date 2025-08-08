import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { NU__Affiliation__cEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Affiliations.top-area') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-nu__affiliation__c-form-top-area',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="Name"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="NU__Account__c"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="NU__ParentAccount__c"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="NU__Role__c"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="NU__Search__c"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="NU__Status__c"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class NU__Affiliation__cTopComponent extends BaseFormSectionComponent {
    @Input() override record!: NU__Affiliation__cEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadNU__Affiliation__cTopComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      