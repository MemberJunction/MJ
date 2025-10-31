import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { CampaignDocStatusTypeEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Campaign Doc Status Types.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-campaigndocstatustype-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="Name"
            Type="textbox"
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
export class CampaignDocStatusTypeDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: CampaignDocStatusTypeEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadCampaignDocStatusTypeDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      