import { Component } from '@angular/core';
import { MJEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentity-form',
    templateUrl: './mjentity.form.component.html'
})
export class MJEntityFormComponent extends BaseFormComponent {
    public record!: MJEntityEntity;

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
            { sectionKey: 'mJApplicationEntities', sectionName: 'Application Entities', isExpanded: false },
            { sectionKey: 'mJAuditLogs', sectionName: 'Audit Logs', isExpanded: false },
            { sectionKey: 'mJCompanyIntegrationRecordMaps', sectionName: 'Company Integration Record Maps', isExpanded: false },
            { sectionKey: 'mJCompanyIntegrationRunDetails', sectionName: 'Company Integration Run Details', isExpanded: false },
            { sectionKey: 'mJConversations', sectionName: 'Conversations', isExpanded: false },
            { sectionKey: 'mJDataContextItems', sectionName: 'Data Context Items', isExpanded: false },
            { sectionKey: 'mJDatasetItems', sectionName: 'Dataset Items', isExpanded: false },
            { sectionKey: 'mJDuplicateRuns', sectionName: 'Duplicate Runs', isExpanded: false },
            { sectionKey: 'mJEntities', sectionName: 'Entities', isExpanded: false },
            { sectionKey: 'mJEntityActions', sectionName: 'Entity Actions', isExpanded: false },
            { sectionKey: 'mJEntityAIActions', sectionName: 'AI Actions', isExpanded: false },
            { sectionKey: 'mJEntityCommunicationMessageTypes', sectionName: 'Entity Communication Message Types', isExpanded: false },
            { sectionKey: 'mJEntityDocuments', sectionName: 'Entity Documents', isExpanded: false },
            { sectionKey: 'mJEntityFields', sectionName: 'Fields', isExpanded: false },
            { sectionKey: 'mJEntityPermissions', sectionName: 'Permissions', isExpanded: false },
            { sectionKey: 'mJEntityRecordDocuments', sectionName: 'Entity Record Documents', isExpanded: false },
            { sectionKey: 'mJEntityRelationships', sectionName: 'Relationships', isExpanded: false },
            { sectionKey: 'mJEntitySettings', sectionName: 'Entity Settings', isExpanded: false },
            { sectionKey: 'mJFileEntityRecordLinks', sectionName: 'File Entity Record Links', isExpanded: false },
            { sectionKey: 'mJIntegrationURLFormats', sectionName: 'Integration URL Formats', isExpanded: false },
            { sectionKey: 'mJLists', sectionName: 'Lists', isExpanded: false },
            { sectionKey: 'mJQueryFields', sectionName: 'Query Fields', isExpanded: false },
            { sectionKey: 'mJRecommendationItems', sectionName: 'Recommendation Items', isExpanded: false },
            { sectionKey: 'mJRecommendations', sectionName: 'Recommendations', isExpanded: false },
            { sectionKey: 'mJRecordChanges', sectionName: 'Record Changes', isExpanded: false },
            { sectionKey: 'mJRecordMergeLogs', sectionName: 'Record Merge Logs', isExpanded: false },
            { sectionKey: 'mJResourceTypes', sectionName: 'Resource Types', isExpanded: false },
            { sectionKey: 'mJTaggedItems', sectionName: 'Tagged Items', isExpanded: false },
            { sectionKey: 'mJTemplateParams', sectionName: 'Template Params', isExpanded: false },
            { sectionKey: 'mJUserApplicationEntities', sectionName: 'User Application Entities', isExpanded: false },
            { sectionKey: 'mJUserFavorites', sectionName: 'User Favorites', isExpanded: false },
            { sectionKey: 'mJUserRecordLogs', sectionName: 'User Record Logs', isExpanded: false },
            { sectionKey: 'mJUserViewCategories', sectionName: 'User View Categories', isExpanded: false },
            { sectionKey: 'mJUserViews', sectionName: 'User Views', isExpanded: false },
            { sectionKey: 'mJUsers', sectionName: 'Users', isExpanded: false },
            { sectionKey: 'mJAccessControlRules', sectionName: 'Access Control Rules', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'AI Agent Examples', isExpanded: false },
            { sectionKey: 'mJAIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJQueryEntities', sectionName: 'Query Entities', isExpanded: false },
            { sectionKey: 'mJRecordLinksSourceEntityID', sectionName: 'Record Links (Source Entity ID)', isExpanded: false },
            { sectionKey: 'mJVersionLabelItems', sectionName: 'Version Label Items', isExpanded: false },
            { sectionKey: 'mJVersionLabels', sectionName: 'Version Labels', isExpanded: false },
            { sectionKey: 'mJGeneratedCodes', sectionName: 'Generated Codes', isExpanded: false },
            { sectionKey: 'mJRecordLinksTargetEntityID', sectionName: 'Record Links (Target Entity ID)', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJTestRuns', sectionName: 'Test Runs', isExpanded: false }
        ]);
    }
}

