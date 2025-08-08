import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { co_dist_descEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'County District Codes.top-area') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-co_dist_desc-form-top-area',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="description"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="co_dist_char"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="County"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class co_dist_descTopComponent extends BaseFormSectionComponent {
    @Input() override record!: co_dist_descEntity;
    @Input() override EditMode: boolean = false;
}

export function Loadco_dist_descTopComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      