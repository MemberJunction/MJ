import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { UserViewRunDetailEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'User View Run Details.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-userviewrundetail-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
    [record]="record"
    FieldName="UserViewRunID"
    Type="numerictextbox"
    [EditMode]="EditMode"
            LinkType="Record"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="RecordID"
    Type="textarea"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="UserViewID"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="EntityID"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>

    </div>
</div>
    `
})
export class UserViewRunDetailDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: UserViewRunDetailEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadUserViewRunDetailDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      