import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ActivityAttachmentEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Activity Attachments.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-activityattachment-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="Attachments"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="CreatedAt"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="UpdatedAt"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class ActivityAttachmentDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ActivityAttachmentEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadActivityAttachmentDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      