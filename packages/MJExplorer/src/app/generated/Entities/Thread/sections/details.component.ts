import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ThreadEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Threads.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-thread-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="false"
            FieldName="Name"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class ThreadDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ThreadEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadThreadDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      