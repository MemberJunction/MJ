import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { EntityFieldEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entity Fields.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entityfield-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span >{{FormatValue('EntityID', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <span >{{FormatValue('Sequence', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Display Name</label>
            <kendo-textarea [(ngModel)]="record.DisplayName" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Auto Update Description</label>
            <input type="checkbox" [(ngModel)]="record.AutoUpdateDescription" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Primary Key</label>
            <input type="checkbox" [(ngModel)]="record.IsPrimaryKey" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Unique</label>
            <input type="checkbox" [(ngModel)]="record.IsUnique" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Category</label>
            <kendo-textarea [(ngModel)]="record.Category" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <span >{{FormatValue('Type', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Length</label>
            <span >{{FormatValue('Length', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Precision</label>
            <span >{{FormatValue('Precision', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Scale</label>
            <span >{{FormatValue('Scale', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Allows Null</label>
            <span >{{FormatValue('AllowsNull', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Default Value</label>
            <span >{{FormatValue('DefaultValue', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Auto Increment</label>
            <span >{{FormatValue('AutoIncrement', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Value List Type</label>
            <kendo-textbox [(ngModel)]="record.ValueListType"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Extended Type</label>
            <kendo-textbox [(ngModel)]="record.ExtendedType"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Default In View</label>
            <input type="checkbox" [(ngModel)]="record.DefaultInView" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">View Cell Template</label>
            <kendo-textbox [(ngModel)]="record.ViewCellTemplate"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Default Column Width</label>
            <kendo-numerictextbox [(value)]="record.DefaultColumnWidth" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Allow Update API</label>
            <input type="checkbox" [(ngModel)]="record.AllowUpdateAPI" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Allow Update In View</label>
            <input type="checkbox" [(ngModel)]="record.AllowUpdateInView" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Include In User Search API</label>
            <input type="checkbox" [(ngModel)]="record.IncludeInUserSearchAPI" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Search Enabled</label>
            <input type="checkbox" [(ngModel)]="record.FullTextSearchEnabled" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User Search Param Format API</label>
            <kendo-textarea [(ngModel)]="record.UserSearchParamFormatAPI" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Include In Generated Form</label>
            <input type="checkbox" [(ngModel)]="record.IncludeInGeneratedForm" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Generated Form Section</label>
            <kendo-textbox [(ngModel)]="record.GeneratedFormSection"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Virtual</label>
            <span >{{FormatValue('IsVirtual', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Name Field</label>
            <input type="checkbox" [(ngModel)]="record.IsNameField" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">RelatedEntity ID</label>
            <kendo-numerictextbox [(value)]="record.RelatedEntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Field Name</label>
            <kendo-textarea [(ngModel)]="record.RelatedEntityFieldName" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Include Related Entity Name Field In Base View</label>
            <input type="checkbox" [(ngModel)]="record.IncludeRelatedEntityNameFieldInBaseView" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Name Field Map</label>
            <kendo-textarea [(ngModel)]="record.RelatedEntityNameFieldMap" ></kendo-textarea>   
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
            <label class="fieldLabel">Schema Name</label>
            <span >{{FormatValue('SchemaName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Base Table</label>
            <span >{{FormatValue('BaseTable', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Base View</label>
            <span >{{FormatValue('BaseView', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Code Name</label>
            <span >{{FormatValue('EntityCodeName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Class Name</label>
            <span >{{FormatValue('EntityClassName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity</label>
            <span >{{FormatValue('RelatedEntity', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Schema Name</label>
            <span >{{FormatValue('RelatedEntitySchemaName', 0)}}</span>   
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
            <label class="fieldLabel">Related Entity Code Name</label>
            <span >{{FormatValue('RelatedEntityCodeName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Class Name</label>
            <span >{{FormatValue('RelatedEntityClassName', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <span >{{FormatValue('Sequence', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Display Name</label>
            <span >{{FormatValue('DisplayName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <span >{{FormatValue('Description', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Auto Update Description</label>
            <span >{{FormatValue('AutoUpdateDescription', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Primary Key</label>
            <span >{{FormatValue('IsPrimaryKey', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Unique</label>
            <span >{{FormatValue('IsUnique', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Category</label>
            <span >{{FormatValue('Category', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <span >{{FormatValue('Type', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Length</label>
            <span >{{FormatValue('Length', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Precision</label>
            <span >{{FormatValue('Precision', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Scale</label>
            <span >{{FormatValue('Scale', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Allows Null</label>
            <span >{{FormatValue('AllowsNull', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Default Value</label>
            <span >{{FormatValue('DefaultValue', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Auto Increment</label>
            <span >{{FormatValue('AutoIncrement', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Value List Type</label>
            <span >{{FormatValue('ValueListType', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Extended Type</label>
            <span >{{FormatValue('ExtendedType', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Default In View</label>
            <span >{{FormatValue('DefaultInView', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">View Cell Template</label>
            <span >{{FormatValue('ViewCellTemplate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Default Column Width</label>
            <span >{{FormatValue('DefaultColumnWidth', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Allow Update API</label>
            <span >{{FormatValue('AllowUpdateAPI', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Allow Update In View</label>
            <span >{{FormatValue('AllowUpdateInView', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Include In User Search API</label>
            <span >{{FormatValue('IncludeInUserSearchAPI', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Search Enabled</label>
            <span >{{FormatValue('FullTextSearchEnabled', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User Search Param Format API</label>
            <span >{{FormatValue('UserSearchParamFormatAPI', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Include In Generated Form</label>
            <span >{{FormatValue('IncludeInGeneratedForm', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Generated Form Section</label>
            <span >{{FormatValue('GeneratedFormSection', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Virtual</label>
            <span >{{FormatValue('IsVirtual', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Name Field</label>
            <span >{{FormatValue('IsNameField', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">RelatedEntity ID</label>
            <span >{{FormatValue('RelatedEntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Field Name</label>
            <span >{{FormatValue('RelatedEntityFieldName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Include Related Entity Name Field In Base View</label>
            <span >{{FormatValue('IncludeRelatedEntityNameFieldInBaseView', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Name Field Map</label>
            <span >{{FormatValue('RelatedEntityNameFieldMap', 0)}}</span>
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
            <label class="fieldLabel">Schema Name</label>
            <span >{{FormatValue('SchemaName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Base Table</label>
            <span >{{FormatValue('BaseTable', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Base View</label>
            <span >{{FormatValue('BaseView', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Code Name</label>
            <span >{{FormatValue('EntityCodeName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Class Name</label>
            <span >{{FormatValue('EntityClassName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity</label>
            <span >{{FormatValue('RelatedEntity', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Schema Name</label>
            <span >{{FormatValue('RelatedEntitySchemaName', 0)}}</span>
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
            <label class="fieldLabel">Related Entity Code Name</label>
            <span >{{FormatValue('RelatedEntityCodeName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Related Entity Class Name</label>
            <span >{{FormatValue('RelatedEntityClassName', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EntityFieldDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityFieldEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityFieldDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
