import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { EntityEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entities.ui') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entity-form-ui',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User Form Generated</label>
            <input type="checkbox" [(ngModel)]="record.UserFormGenerated" kendoCheckBox />   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User Form Generated</label>
            <span >{{FormatValue('UserFormGenerated', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EntityUIComponent extends BaseFormSectionComponent {
    @Input() override record: EntityEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityUIComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
