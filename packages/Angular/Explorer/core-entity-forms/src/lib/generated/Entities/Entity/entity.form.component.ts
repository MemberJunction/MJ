import { Component } from '@angular/core';
import { EntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Entities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entity-form',
    templateUrl: './entity.form.component.html'
})
export class EntityFormComponent extends BaseFormComponent {
    public record!: EntityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identityStructure', sectionName: 'Identity & Structure', isExpanded: true },
            { sectionKey: 'userInterfaceCustomization', sectionName: 'User Interface & Customization', isExpanded: true },
            { sectionKey: 'auditingLifecycle', sectionName: 'Auditing & Lifecycle', isExpanded: false },
            { sectionKey: 'aPISearchSettings', sectionName: 'API & Search Settings', isExpanded: false },
            { sectionKey: 'proceduresDeletion', sectionName: 'Procedures & Deletion', isExpanded: false },
            { sectionKey: 'rowStatistics', sectionName: 'Row Statistics', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'applicationEntities', sectionName: 'Application Entities', isExpanded: false },
            { sectionKey: 'auditLogs', sectionName: 'Audit Logs', isExpanded: false },
            { sectionKey: 'companyIntegrationRecordMaps', sectionName: 'Company Integration Record Maps', isExpanded: false },
            { sectionKey: 'companyIntegrationRunDetails', sectionName: 'Company Integration Run Details', isExpanded: false },
            { sectionKey: 'conversations', sectionName: 'Conversations', isExpanded: false },
            { sectionKey: 'dataContextItems', sectionName: 'Data Context Items', isExpanded: false },
            { sectionKey: 'datasetItems', sectionName: 'Dataset Items', isExpanded: false },
            { sectionKey: 'duplicateRuns', sectionName: 'Duplicate Runs', isExpanded: false },
            { sectionKey: 'entities', sectionName: 'Entities', isExpanded: false },
            { sectionKey: 'entityActions', sectionName: 'Entity Actions', isExpanded: false },
            { sectionKey: 'aIActions', sectionName: 'AI Actions', isExpanded: false },
            { sectionKey: 'entityCommunicationMessageTypes', sectionName: 'Entity Communication Message Types', isExpanded: false },
            { sectionKey: 'entityDocuments', sectionName: 'Entity Documents', isExpanded: false },
            { sectionKey: 'fields', sectionName: 'Fields', isExpanded: false },
            { sectionKey: 'permissions', sectionName: 'Permissions', isExpanded: false },
            { sectionKey: 'entityRecordDocuments', sectionName: 'Entity Record Documents', isExpanded: false },
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: false },
            { sectionKey: 'entitySettings', sectionName: 'Entity Settings', isExpanded: false },
            { sectionKey: 'fileEntityRecordLinks', sectionName: 'File Entity Record Links', isExpanded: false },
            { sectionKey: 'integrationURLFormats', sectionName: 'Integration URL Formats', isExpanded: false },
            { sectionKey: 'lists', sectionName: 'Lists', isExpanded: false },
            { sectionKey: 'queryFields', sectionName: 'Query Fields', isExpanded: false },
            { sectionKey: 'recommendationItems', sectionName: 'Recommendation Items', isExpanded: false },
            { sectionKey: 'recommendations', sectionName: 'Recommendations', isExpanded: false },
            { sectionKey: 'recordChanges', sectionName: 'Record Changes', isExpanded: false },
            { sectionKey: 'recordMergeLogs', sectionName: 'Record Merge Logs', isExpanded: false },
            { sectionKey: 'resourceTypes', sectionName: 'Resource Types', isExpanded: false },
            { sectionKey: 'taggedItems', sectionName: 'Tagged Items', isExpanded: false },
            { sectionKey: 'templateParams', sectionName: 'Template Params', isExpanded: false },
            { sectionKey: 'userApplicationEntities', sectionName: 'User Application Entities', isExpanded: false },
            { sectionKey: 'userFavorites', sectionName: 'User Favorites', isExpanded: false },
            { sectionKey: 'userRecordLogs', sectionName: 'User Record Logs', isExpanded: false },
            { sectionKey: 'userViewCategories', sectionName: 'User View Categories', isExpanded: false },
            { sectionKey: 'userViews', sectionName: 'User Views', isExpanded: false },
            { sectionKey: 'users', sectionName: 'Users', isExpanded: false },
            { sectionKey: 'mJAccessControlRules', sectionName: 'MJ: Access Control Rules', isExpanded: false },
            { sectionKey: 'mJRecordLinks', sectionName: 'MJ: Record Links', isExpanded: false },
            { sectionKey: 'queryEntities', sectionName: 'Query Entities', isExpanded: false },
            { sectionKey: 'generatedCodes', sectionName: 'Generated Codes', isExpanded: false },
            { sectionKey: 'mJRecordLinks1', sectionName: 'MJ: Record Links', isExpanded: false },
            { sectionKey: 'mJTestRuns', sectionName: 'MJ: Test Runs', isExpanded: false }
        ]);
    }
}

export function LoadEntityFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
