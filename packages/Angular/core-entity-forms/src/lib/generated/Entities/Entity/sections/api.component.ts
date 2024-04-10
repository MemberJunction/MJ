import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { EntityEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entities.api') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entity-form-api',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Include In API</label>
            <input type="checkbox" [(ngModel)]="record.IncludeInAPI" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Allow All Rows API</label>
            <input type="checkbox" [(ngModel)]="record.AllowAllRowsAPI" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Allow Update API</label>
            <input type="checkbox" [(ngModel)]="record.AllowUpdateAPI" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Allow Create API</label>
            <input type="checkbox" [(ngModel)]="record.AllowCreateAPI" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Allow Delete API</label>
            <input type="checkbox" [(ngModel)]="record.AllowDeleteAPI" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Custom Resolver API</label>
            <input type="checkbox" [(ngModel)]="record.CustomResolverAPI" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Allow User Search API</label>
            <input type="checkbox" [(ngModel)]="record.AllowUserSearchAPI" kendoCheckBox />   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Include In API</label>
            <span >{{FormatValue('IncludeInAPI', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Allow All Rows API</label>
            <span >{{FormatValue('AllowAllRowsAPI', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Allow Update API</label>
            <span >{{FormatValue('AllowUpdateAPI', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Allow Create API</label>
            <span >{{FormatValue('AllowCreateAPI', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Allow Delete API</label>
            <span >{{FormatValue('AllowDeleteAPI', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Custom Resolver API</label>
            <span >{{FormatValue('CustomResolverAPI', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Allow User Search API</label>
            <span >{{FormatValue('AllowUserSearchAPI', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EntityAPIComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityAPIComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      