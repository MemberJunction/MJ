import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ConversationArtifactPermissionEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'MJ: Conversation Artifact Permissions.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-conversationartifactpermission-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="ConversationArtifactID"
            Type="textbox"
            [EditMode]="EditMode"
            LinkType="Record"
            LinkComponentType="Search"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="UserID"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="AccessLevel"
            Type="dropdownlist"
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
            FieldName="ConversationArtifact"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class ConversationArtifactPermissionDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ConversationArtifactPermissionEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadConversationArtifactPermissionDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      