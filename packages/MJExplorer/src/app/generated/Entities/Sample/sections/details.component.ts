import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { SampleEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Samples.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-sample-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Sample ID</label>
            <span >{{FormatValue('SampleID', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Value A</label>
            <kendo-textbox [(ngModel)]="record.ValueA"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Value B</label>
            <kendo-textarea [(ngModel)]="record.ValueB" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Sample ID</label>
            <span >{{FormatValue('SampleID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Value A</label>
            <span >{{FormatValue('ValueA', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Value B</label>
            <span >{{FormatValue('ValueB', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class SampleDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: SampleEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadSampleDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
