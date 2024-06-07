import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ActionEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Actions.top-area') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-action-form-top-area',
    styleUrls: ['../../../../../shared/form-styles.css'],
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
export class ActionTopComponent extends BaseFormSectionComponent {
    @Input() override record!: ActionEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadActionTopComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      