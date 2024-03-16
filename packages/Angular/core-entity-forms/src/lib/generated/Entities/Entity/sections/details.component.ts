import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { EntityEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entities.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entity-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Parent ID</label>
            <kendo-numerictextbox [(value)]="record.ParentID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Name Suffix</label>
            <kendo-textarea [(ngModel)]="record.NameSuffix" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Auto Update Description</label>
            <input type="checkbox" [(ngModel)]="record.AutoUpdateDescription" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Base View Generated</label>
            <input type="checkbox" [(ngModel)]="record.BaseViewGenerated" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Virtual Entity</label>
            <input type="checkbox" [(ngModel)]="record.VirtualEntity" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Search Enabled</label>
            <input type="checkbox" [(ngModel)]="record.FullTextSearchEnabled" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Catalog</label>
            <kendo-textarea [(ngModel)]="record.FullTextCatalog" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Catalog Generated</label>
            <input type="checkbox" [(ngModel)]="record.FullTextCatalogGenerated" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Index</label>
            <kendo-textarea [(ngModel)]="record.FullTextIndex" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Index Generated</label>
            <input type="checkbox" [(ngModel)]="record.FullTextIndexGenerated" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Search Function</label>
            <kendo-textarea [(ngModel)]="record.FullTextSearchFunction" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Search Function Generated</label>
            <input type="checkbox" [(ngModel)]="record.FullTextSearchFunctionGenerated" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User View Max Rows</label>
            <kendo-numerictextbox [(value)]="record.UserViewMaxRows!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Cascade Deletes</label>
            <input type="checkbox" [(ngModel)]="record.CascadeDeletes" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Object Subclass Name</label>
            <kendo-textarea [(ngModel)]="record.EntityObjectSubclassName" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Object Subclass Import</label>
            <kendo-textarea [(ngModel)]="record.EntityObjectSubclassImport" ></kendo-textarea>   
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
            <label class="fieldLabel">Code Name</label>
            <span >{{FormatValue('CodeName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Class Name</label>
            <span >{{FormatValue('ClassName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Base Table Code Name</label>
            <span >{{FormatValue('BaseTableCodeName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Parent Entity</label>
            <span >{{FormatValue('ParentEntity', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Parent Base Table</label>
            <span >{{FormatValue('ParentBaseTable', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Parent Base View</label>
            <span >{{FormatValue('ParentBaseView', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Parent ID</label>
            <span mjFieldLink [record]="record" fieldName="ParentID" >{{FormatValue('ParentID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Name Suffix</label>
            <span >{{FormatValue('NameSuffix', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Auto Update Description</label>
            <span >{{FormatValue('AutoUpdateDescription', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Base View Generated</label>
            <span >{{FormatValue('BaseViewGenerated', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Virtual Entity</label>
            <span >{{FormatValue('VirtualEntity', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Search Enabled</label>
            <span >{{FormatValue('FullTextSearchEnabled', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Catalog</label>
            <span >{{FormatValue('FullTextCatalog', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Catalog Generated</label>
            <span >{{FormatValue('FullTextCatalogGenerated', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Index</label>
            <span >{{FormatValue('FullTextIndex', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Index Generated</label>
            <span >{{FormatValue('FullTextIndexGenerated', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Search Function</label>
            <span >{{FormatValue('FullTextSearchFunction', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Full Text Search Function Generated</label>
            <span >{{FormatValue('FullTextSearchFunctionGenerated', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User View Max Rows</label>
            <span >{{FormatValue('UserViewMaxRows', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Cascade Deletes</label>
            <span >{{FormatValue('CascadeDeletes', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Object Subclass Name</label>
            <span >{{FormatValue('EntityObjectSubclassName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Object Subclass Import</label>
            <span >{{FormatValue('EntityObjectSubclassImport', 0)}}</span>
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
            <label class="fieldLabel">Code Name</label>
            <span >{{FormatValue('CodeName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Class Name</label>
            <span >{{FormatValue('ClassName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Base Table Code Name</label>
            <span >{{FormatValue('BaseTableCodeName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Parent Entity</label>
            <span >{{FormatValue('ParentEntity', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Parent Base Table</label>
            <span >{{FormatValue('ParentBaseTable', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Parent Base View</label>
            <span >{{FormatValue('ParentBaseView', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EntityDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
