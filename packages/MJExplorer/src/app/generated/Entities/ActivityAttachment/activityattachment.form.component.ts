import { Component } from '@angular/core';
import { ActivityAttachmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActivityAttachmentDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Activity Attachments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-activityattachment-form',
    templateUrl: './activityattachment.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActivityAttachmentFormComponent extends BaseFormComponent {
    public record!: ActivityAttachmentEntity;
} 

export function LoadActivityAttachmentFormComponent() {
    LoadActivityAttachmentDetailsComponent();
}
