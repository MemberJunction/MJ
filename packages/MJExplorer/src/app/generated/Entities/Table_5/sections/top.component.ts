import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { Table_5Entity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Enrolments.top-area') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-table_5-form-top-area',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="false"
            FieldName="District"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class Table_5TopComponent extends BaseFormSectionComponent {
    @Input() override record!: Table_5Entity;
    @Input() override EditMode: boolean = false;
}

export function LoadTable_5TopComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      