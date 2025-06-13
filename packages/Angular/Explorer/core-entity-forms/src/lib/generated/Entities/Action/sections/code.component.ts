import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ActionEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Actions.code') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-action-form-code',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="false"
            FieldName="Code"
            Type="code"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class ActionCodeComponent extends BaseFormSectionComponent {
    @Input() override record!: ActionEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadActionCodeComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      