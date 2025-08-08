import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { PersonEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Persons.top-area') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-person-form-top-area',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="FullName"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="Email"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="MembershipType"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class PersonTopComponent extends BaseFormSectionComponent {
    @Input() override record!: PersonEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadPersonTopComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      