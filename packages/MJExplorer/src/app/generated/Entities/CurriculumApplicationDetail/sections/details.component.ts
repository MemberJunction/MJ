import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { CurriculumApplicationDetailEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Curriculum Application Details.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-curriculumapplicationdetail-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="CurriculumApplicationID"
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
            FieldName="CertificationID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
            LinkComponentType="Search"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="Comments"
            Type="textarea"
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

    </div>
</div>
    `
})
export class CurriculumApplicationDetailDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: CurriculumApplicationDetailEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadCurriculumApplicationDetailDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      