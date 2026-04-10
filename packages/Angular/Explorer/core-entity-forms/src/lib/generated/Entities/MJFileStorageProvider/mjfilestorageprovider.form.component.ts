import { Component } from '@angular/core';
import { MJFileStorageProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: File Storage Providers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjfilestorageprovider-form',
    templateUrl: './mjfilestorageprovider.form.component.html'
})
export class MJFileStorageProviderFormComponent extends BaseFormComponent {
    public record!: MJFileStorageProviderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerIdentification', sectionName: 'Provider Identification', isExpanded: true },
            { sectionKey: 'driverConfiguration', sectionName: 'Driver Configuration', isExpanded: true },
            { sectionKey: 'selectionAvailability', sectionName: 'Selection & Availability', isExpanded: false },
            { sectionKey: 'authenticationAccess', sectionName: 'Authentication & Access', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJFiles', sectionName: 'Files', isExpanded: false },
            { sectionKey: 'mJFileStorageAccounts', sectionName: 'File Storage Accounts', isExpanded: false },
            { sectionKey: 'mJAIConfigurations', sectionName: 'AI Configurations', isExpanded: false },
            { sectionKey: 'mJAIAgents', sectionName: 'AI Agents', isExpanded: false }
        ]);
    }
}

