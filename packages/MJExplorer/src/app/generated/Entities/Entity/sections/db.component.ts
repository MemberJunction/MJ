import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { EntityEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entities.db') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entity-form-db',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">spCreate</label>
            <kendo-textarea [(ngModel)]="record.spCreate" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">spUpdate</label>
            <kendo-textarea [(ngModel)]="record.spUpdate" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">spDelete</label>
            <kendo-textarea [(ngModel)]="record.spDelete" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">sp CreateGenerated</label>
            <input type="checkbox" [(ngModel)]="record.spCreateGenerated" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">sp Update Generated</label>
            <input type="checkbox" [(ngModel)]="record.spUpdateGenerated" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">sp Delete Generated</label>
            <input type="checkbox" [(ngModel)]="record.spDeleteGenerated" kendoCheckBox />   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">spCreate</label>
            <span >{{FormatValue('spCreate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">spUpdate</label>
            <span >{{FormatValue('spUpdate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">spDelete</label>
            <span >{{FormatValue('spDelete', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">sp CreateGenerated</label>
            <span >{{FormatValue('spCreateGenerated', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">sp Update Generated</label>
            <span >{{FormatValue('spUpdateGenerated', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">sp Delete Generated</label>
            <span >{{FormatValue('spDeleteGenerated', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EntityDBComponent extends BaseFormSectionComponent {
    @Input() override record: EntityEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityDBComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
