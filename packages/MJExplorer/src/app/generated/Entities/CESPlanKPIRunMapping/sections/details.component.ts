import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { CESPlanKPIRunMappingEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'CES Plan KPI Run Mappings.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-cesplankpirunmapping-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="CESPlanID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
            LinkComponentType="Search"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="Sequence"
            Type="numerictextbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="KPIRunID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
            LinkComponentType="Search"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="IsCESExecuted"
            Type="checkbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="__mj_CreatedAt"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="__mj_UpdatedAt"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="CESPlan"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class CESPlanKPIRunMappingDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: CESPlanKPIRunMappingEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadCESPlanKPIRunMappingDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      