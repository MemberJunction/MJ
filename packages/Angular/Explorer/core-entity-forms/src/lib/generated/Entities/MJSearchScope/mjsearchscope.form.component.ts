import { Component } from '@angular/core';
import { MJSearchScopeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Search Scopes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsearchscope-form',
    templateUrl: './mjsearchscope.form.component.html'
})
export class MJSearchScopeFormComponent extends BaseFormComponent {
    public record!: MJSearchScopeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'scopeBehavior', sectionName: 'Scope Behavior', isExpanded: true },
            { sectionKey: 'accessControl', sectionName: 'Access Control', isExpanded: true },
            { sectionKey: 'lifecycleAndAvailability', sectionName: 'Lifecycle and Availability', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJSearchScopeEntities', sectionName: 'Search Scope Entities', isExpanded: false },
            { sectionKey: 'mJSearchScopeExternalIndexes', sectionName: 'Search Scope External Indexes', isExpanded: false },
            { sectionKey: 'mJSearchScopePermissions', sectionName: 'Search Scope Permissions', isExpanded: false },
            { sectionKey: 'mJSearchScopeProviders', sectionName: 'Search Scope Providers', isExpanded: false },
            { sectionKey: 'mJSearchScopeStorageAccounts', sectionName: 'Search Scope Storage Accounts', isExpanded: false },
            { sectionKey: 'mJSearchScopeTestQueries', sectionName: 'Search Scope Test Queries', isExpanded: false },
            { sectionKey: 'mJAIAgentSearchScopes', sectionName: 'AI Agent Search Scopes', isExpanded: false },
            { sectionKey: 'mJSearchExecutionLogs', sectionName: 'Search Execution Logs', isExpanded: false }
        ]);
    }
}

