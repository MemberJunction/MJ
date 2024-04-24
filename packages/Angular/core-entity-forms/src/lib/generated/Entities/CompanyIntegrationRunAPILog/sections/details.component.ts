import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { CompanyIntegrationRunAPILogEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Company Integration Run API Logs.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-companyintegrationrunapilog-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field
            [record]="record"
            FieldName="CompanyIntegrationRunID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="ExecutedAt"
            Type="datepicker"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="IsSuccess"
            Type="checkbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="RequestMethod"
            Type="dropdownlist"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="URL"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="Parameters"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class CompanyIntegrationRunAPILogDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: CompanyIntegrationRunAPILogEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadCompanyIntegrationRunAPILogDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      