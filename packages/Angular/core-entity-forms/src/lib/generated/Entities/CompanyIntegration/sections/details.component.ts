import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { CompanyIntegrationEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Company Integrations.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-companyintegration-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
    [record]="record"
    FieldName="CompanyName"
    Type="textbox"
    [EditMode]="EditMode"
            LinkType="Record"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="IntegrationName"
    Type="textbox"
    [EditMode]="EditMode"
            LinkType="Record"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="IsActive"
    Type="checkbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="AccessToken"
    Type="textarea"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="RefreshToken"
    Type="textarea"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="TokenExpirationDate"
    Type="datepicker"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="APIKey"
    Type="textarea"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="CreatedAt"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="UpdatedAt"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="ExternalSystemID"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="IsExternalSystemReadOnly"
    Type="checkbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="ClientID"
    Type="textarea"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="ClientSecret"
    Type="textarea"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="CustomAttribute1"
    Type="textarea"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="CompanyID"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="IntegrationID"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="Company"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="Integration"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="DriverClassName"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="DriverImportPath"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="LastRunID"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="LastRunStartedAt"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="LastRunEndedAt"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>

    </div>
</div>
    `
})
export class CompanyIntegrationDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: CompanyIntegrationEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadCompanyIntegrationDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      