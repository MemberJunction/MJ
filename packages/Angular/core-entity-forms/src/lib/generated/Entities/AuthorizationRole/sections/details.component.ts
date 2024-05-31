import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { AuthorizationRoleEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Authorization Roles.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-authorizationrole-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
    [record]="record"
    FieldName="AuthorizationName"
    Type="textbox"
    [EditMode]="EditMode"
            LinkType="Record"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="RoleName"
    Type="textbox"
    [EditMode]="EditMode"
            LinkType="Record"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="Type"
    Type="dropdownlist"
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

    </div>
</div>
    `
})
export class AuthorizationRoleDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: AuthorizationRoleEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadAuthorizationRoleDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      