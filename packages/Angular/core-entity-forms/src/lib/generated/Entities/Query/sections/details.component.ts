import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { QueryEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Queries.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-query-form-details',
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
            <label class="fieldLabel">Category ID</label>
            <kendo-numerictextbox [(value)]="record.CategoryID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">SQL</label>
            <kendo-textbox [(ngModel)]="record.SQL"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Original SQL</label>
            <kendo-textbox [(ngModel)]="record.OriginalSQL"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Feedback</label>
            <kendo-textbox [(ngModel)]="record.Feedback"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <kendo-dropdownlist [data]="['Pending', 'Approved', 'Rejected', 'Expired']" [(ngModel)]="record.Status" ></kendo-dropdownlist>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Quality Rank</label>
            <kendo-numerictextbox [(value)]="record.QualityRank!" ></kendo-numerictextbox>   
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
            <label class="fieldLabel">Category</label>
            <span >{{FormatValue('Category', 0)}}</span>   
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
            <label class="fieldLabel">Category ID</label>
            <span mjFieldLink [record]="record" fieldName="CategoryID" >{{FormatValue('CategoryID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">SQL</label>
            <span >{{FormatValue('SQL', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Original SQL</label>
            <span >{{FormatValue('OriginalSQL', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Feedback</label>
            <span >{{FormatValue('Feedback', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <span >{{FormatValue('Status', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Quality Rank</label>
            <span >{{FormatValue('QualityRank', 0)}}</span>
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
            <label class="fieldLabel">Category</label>
            <span >{{FormatValue('Category', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class QueryDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: QueryEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadQueryDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
