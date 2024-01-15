import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { EntityEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entities.audit') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entity-form-audit',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Audit Record Access</label>
            <input type="checkbox" [(ngModel)]="record.AuditRecordAccess" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Audit View Runs</label>
            <input type="checkbox" [(ngModel)]="record.AuditViewRuns" kendoCheckBox />   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Audit Record Access</label>
            <span >{{FormatValue('AuditRecordAccess', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Audit View Runs</label>
            <span >{{FormatValue('AuditViewRuns', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EntityAuditComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityAuditComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
