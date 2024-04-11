import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { EntityRelationshipEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entity Relationships.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entityrelationship-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <kendo-numerictextbox [(value)]="record.Sequence" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity ID</label>
            <kendo-numerictextbox [(value)]="record.RelatedEntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Bundle In API</label>
            <input type="checkbox" [(ngModel)]="record.BundleInAPI" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Include In Parent All Query</label>
            <input type="checkbox" [(ngModel)]="record.IncludeInParentAllQuery" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <kendo-dropdownlist [data]="['One To Many', 'Many To Many']" [(ngModel)]="record.Type" ></kendo-dropdownlist>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Key Field</label>
            <kendo-textarea [(ngModel)]="record.EntityKeyField" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Join Field</label>
            <kendo-textarea [(ngModel)]="record.RelatedEntityJoinField" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Join View</label>
            <kendo-textarea [(ngModel)]="record.JoinView" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Join Entity Join Field</label>
            <kendo-textarea [(ngModel)]="record.JoinEntityJoinField" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Join Entity Inverse Join Field</label>
            <kendo-textarea [(ngModel)]="record.JoinEntityInverseJoinField" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Display In Form</label>
            <input type="checkbox" [(ngModel)]="record.DisplayInForm" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Display Name</label>
            <kendo-textarea [(ngModel)]="record.DisplayName" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Display User View GUID</label>
            <span mjFieldLink [record]="record" fieldName="DisplayUserViewGUID" >{{FormatValue('DisplayUserViewGUID', 0)}}</span>   
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
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Base Table</label>
            <span >{{FormatValue('EntityBaseTable', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Base View</label>
            <span >{{FormatValue('EntityBaseView', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity</label>
            <span >{{FormatValue('RelatedEntity', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Base Table</label>
            <span >{{FormatValue('RelatedEntityBaseTable', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Base View</label>
            <span >{{FormatValue('RelatedEntityBaseView', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Class Name</label>
            <span >{{FormatValue('RelatedEntityClassName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Code Name</label>
            <span >{{FormatValue('RelatedEntityCodeName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Base Table Code Name</label>
            <span >{{FormatValue('RelatedEntityBaseTableCodeName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Display User View Name</label>
            <span >{{FormatValue('DisplayUserViewName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Display User View ID</label>
            <span >{{FormatValue('DisplayUserViewID', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <span >{{FormatValue('Sequence', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="RelatedEntityID" >{{FormatValue('RelatedEntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Bundle In API</label>
            <span >{{FormatValue('BundleInAPI', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Include In Parent All Query</label>
            <span >{{FormatValue('IncludeInParentAllQuery', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <span >{{FormatValue('Type', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Key Field</label>
            <span >{{FormatValue('EntityKeyField', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Join Field</label>
            <span >{{FormatValue('RelatedEntityJoinField', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Join View</label>
            <span >{{FormatValue('JoinView', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Join Entity Join Field</label>
            <span >{{FormatValue('JoinEntityJoinField', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Join Entity Inverse Join Field</label>
            <span >{{FormatValue('JoinEntityInverseJoinField', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Display In Form</label>
            <span >{{FormatValue('DisplayInForm', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Display Name</label>
            <span >{{FormatValue('DisplayName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Display User View GUID</label>
            <span mjFieldLink [record]="record" fieldName="DisplayUserViewGUID" >{{FormatValue('DisplayUserViewGUID', 0)}}</span>
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
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Base Table</label>
            <span >{{FormatValue('EntityBaseTable', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Base View</label>
            <span >{{FormatValue('EntityBaseView', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity</label>
            <span >{{FormatValue('RelatedEntity', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Base Table</label>
            <span >{{FormatValue('RelatedEntityBaseTable', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Base View</label>
            <span >{{FormatValue('RelatedEntityBaseView', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Class Name</label>
            <span >{{FormatValue('RelatedEntityClassName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Code Name</label>
            <span >{{FormatValue('RelatedEntityCodeName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Base Table Code Name</label>
            <span >{{FormatValue('RelatedEntityBaseTableCodeName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Display User View Name</label>
            <span >{{FormatValue('DisplayUserViewName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Display User View ID</label>
            <span >{{FormatValue('DisplayUserViewID', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EntityRelationshipDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityRelationshipEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityRelationshipDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      