import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { VectorIndexEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Vector Indexes.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-vectorindex-form-details',
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
        <div class="record-form-row">
            <label class="fieldLabel">Vector Database ID</label>
            <kendo-numerictextbox [(value)]="record.VectorDatabaseID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Embedding Model ID</label>
            <kendo-numerictextbox [(value)]="record.EmbeddingModelID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Vector Database</label>
            <span >{{FormatValue('VectorDatabase', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Embedding Model</label>
            <span >{{FormatValue('EmbeddingModel', 0)}}</span>   
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
        <div class="record-form-row">
            <label class="fieldLabel">Vector Database ID</label>
            <span mjFieldLink [record]="record" fieldName="VectorDatabaseID" >{{FormatValue('VectorDatabaseID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Embedding Model ID</label>
            <span mjFieldLink [record]="record" fieldName="EmbeddingModelID" >{{FormatValue('EmbeddingModelID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Vector Database</label>
            <span >{{FormatValue('VectorDatabase', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Embedding Model</label>
            <span >{{FormatValue('EmbeddingModel', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class VectorIndexDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: VectorIndexEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadVectorIndexDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      