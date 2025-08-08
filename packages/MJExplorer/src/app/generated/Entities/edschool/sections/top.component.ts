import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { edschoolEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Schools.top-area') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-edschool-form-top-area',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="co_dist_code"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="esschool"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="esposcod"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="year"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="asalary"
            Type="numerictextbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class edschoolTopComponent extends BaseFormSectionComponent {
    @Input() override record!: edschoolEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadedschoolTopComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      