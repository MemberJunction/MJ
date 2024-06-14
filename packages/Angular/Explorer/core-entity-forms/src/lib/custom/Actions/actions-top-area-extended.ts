import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ActionTopComponent } from '../../generated/Entities/Action/sections/top.component';

@RegisterClass(BaseFormSectionComponent, 'Actions.top-area') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-action-extended-form-top-area',
    styleUrls: ['../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="Name"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="UserPrompt"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class ActionTopComponentExtended extends ActionTopComponent {

}

export function LoadActionExtendedTopComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      