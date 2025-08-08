import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { Salary_Ranking_TableEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Salary Ranking Tables.top-area') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-salary_ranking_table-form-top-area',
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
            FieldName="co_dist_char"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
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
            FieldName="supt_sal_rank"
            Type="numerictextbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="admin_sal_rank"
            Type="numerictextbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="tchr_sal_rank"
            Type="numerictextbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class Salary_Ranking_TableTopComponent extends BaseFormSectionComponent {
    @Input() override record!: Salary_Ranking_TableEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadSalary_Ranking_TableTopComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      