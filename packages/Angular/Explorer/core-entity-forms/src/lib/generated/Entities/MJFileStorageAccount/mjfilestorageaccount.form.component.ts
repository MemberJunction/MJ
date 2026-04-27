import { Component } from '@angular/core';
import { MJFileStorageAccountEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: File Storage Accounts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjfilestorageaccount-form',
    templateUrl: './mjfilestorageaccount.form.component.html'
})
export class MJFileStorageAccountFormComponent extends BaseFormComponent {
    public record!: MJFileStorageAccountEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'accountOverview', sectionName: 'Account Overview', isExpanded: true },
            { sectionKey: 'connectionDetails', sectionName: 'Connection Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentTypes', sectionName: 'AI Agent Types', isExpanded: false },
            { sectionKey: 'mJSearchScopeStorageAccounts', sectionName: 'Search Scope Storage Accounts', isExpanded: false },
            { sectionKey: 'mJArchiveConfigurations', sectionName: 'Archive Configurations', isExpanded: false },
            { sectionKey: 'mJFileStorageAccountPermissions', sectionName: 'File Storage Account Permissions', isExpanded: false },
            { sectionKey: 'mJAIAgentCategories', sectionName: 'AI Agent Categories', isExpanded: false },
            { sectionKey: 'mJAIAgents', sectionName: 'AI Agents', isExpanded: false }
        ]);
    }
}

