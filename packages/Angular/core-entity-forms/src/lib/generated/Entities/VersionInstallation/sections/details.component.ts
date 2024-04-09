import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { VersionInstallationEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Version Installations.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-versioninstallation-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Major Version</label>
            <kendo-numerictextbox [(value)]="record.MajorVersion" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Minor Version</label>
            <kendo-numerictextbox [(value)]="record.MinorVersion" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Patch Version</label>
            <kendo-numerictextbox [(value)]="record.PatchVersion" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <kendo-dropdownlist [data]="['New', 'Upgrade']" [(ngModel)]="record.Type!" ></kendo-dropdownlist>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Installed At</label>
            <kendo-datepicker [(value)]="record.InstalledAt" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <kendo-dropdownlist [data]="['Pending', 'In Progress', 'Complete', 'Failed']" [(ngModel)]="record.Status" ></kendo-dropdownlist>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Install Log</label>
            <kendo-textbox [(ngModel)]="record.InstallLog"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <kendo-textbox [(ngModel)]="record.Comments"  />   
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
            <label class="fieldLabel">Complete Version</label>
            <span >{{FormatValue('CompleteVersion', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Major Version</label>
            <span >{{FormatValue('MajorVersion', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Minor Version</label>
            <span >{{FormatValue('MinorVersion', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Patch Version</label>
            <span >{{FormatValue('PatchVersion', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <span >{{FormatValue('Type', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Installed At</label>
            <span >{{FormatValue('InstalledAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <span >{{FormatValue('Status', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Install Log</label>
            <span >{{FormatValue('InstallLog', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <span >{{FormatValue('Comments', 0)}}</span>
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
            <label class="fieldLabel">Complete Version</label>
            <span >{{FormatValue('CompleteVersion', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class VersionInstallationDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: VersionInstallationEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadVersionInstallationDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      