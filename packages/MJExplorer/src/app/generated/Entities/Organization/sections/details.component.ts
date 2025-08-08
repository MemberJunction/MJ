import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { OrganizationEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Organizations.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-organization-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="false"
            FieldName="NimbleAccountID"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class OrganizationDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: OrganizationEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadOrganizationDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      