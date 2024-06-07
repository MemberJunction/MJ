import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { UserRoleEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'User Roles.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-userrole-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="UserID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="RoleName"
            Type="textbox"
            [EditMode]="EditMode"
            LinkType="Record"
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
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="User"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class UserRoleDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: UserRoleEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadUserRoleDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      