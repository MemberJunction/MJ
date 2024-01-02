import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { OutputDeliveryTypeEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Output Delivery Types.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-outputdeliverytype-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textarea [(ngModel)]="record.Name" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <span >{{FormatValue('Description', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class OutputDeliveryTypeDetailsComponent extends BaseFormSectionComponent {
    @Input() override record: OutputDeliveryTypeEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadOutputDeliveryTypeDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
