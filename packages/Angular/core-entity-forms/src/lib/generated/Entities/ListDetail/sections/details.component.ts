import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ListDetailEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'List Details.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-listdetail-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">List ID</label>
            <kendo-numerictextbox [(value)]="record.ListID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Record</label>
            <kendo-textarea [(ngModel)]="record.RecordID" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <kendo-numerictextbox [(value)]="record.Sequence" ></kendo-numerictextbox>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">List ID</label>
            <span mjFieldLink [record]="record" fieldName="ListID" >{{FormatValue('ListID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Record</label>
            <span >{{FormatValue('RecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <span >{{FormatValue('Sequence', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class ListDetailDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ListDetailEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadListDetailDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
