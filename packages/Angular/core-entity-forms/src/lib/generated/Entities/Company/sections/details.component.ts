import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { CompanyEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Companies.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-company-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field
            [record]="record"
            FieldName="Name"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="Description"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="Website"
            Type="textbox"
            [EditMode]="EditMode"
            LinkType="URL"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="LogoURL"
            Type="textarea"
            [EditMode]="EditMode"
            LinkType="URL"
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
            FieldName="Domain"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class CompanyDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: CompanyEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadCompanyDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      