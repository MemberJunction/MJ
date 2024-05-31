import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { EntityEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entities.ui') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entity-form-ui',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field mjFillContainer
    [record]="record"
    FieldName="UserFormGenerated"
    Type="checkbox"
    [EditMode]="EditMode"
></mj-form-field>

    </div>
</div>
    `
})
export class EntityUIComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityUIComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      