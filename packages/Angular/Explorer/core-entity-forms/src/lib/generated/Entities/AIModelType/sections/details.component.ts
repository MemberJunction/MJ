import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { AIModelTypeEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'AI Model Types.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-aimodeltype-form-details',
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
            FieldName="Description"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class AIModelTypeDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: AIModelTypeEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadAIModelTypeDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      