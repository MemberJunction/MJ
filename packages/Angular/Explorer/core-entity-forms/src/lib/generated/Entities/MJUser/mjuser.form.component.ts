import { Component } from '@angular/core';
import { MJUserEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Users') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuser-form',
    templateUrl: './mjuser.form.component.html'
})
export class MJUserFormComponent extends BaseFormComponent {
    public record!: MJUserEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'userIdentity', sectionName: 'User Identity', isExpanded: true },
            { sectionKey: 'accountSettings', sectionName: 'Account Settings', isExpanded: true },
            { sectionKey: 'entityLinks', sectionName: 'Entity Links', isExpanded: false },
            { sectionKey: 'employeeDetails', sectionName: 'Employee Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJActionExecutionLogs', sectionName: 'Action Execution Logs', isExpanded: false },
            { sectionKey: 'mJActions', sectionName: 'Actions', isExpanded: false },
            { sectionKey: 'mJAuditLogs', sectionName: 'Audit Logs', isExpanded: false },
            { sectionKey: 'mJCommunicationRuns', sectionName: 'Communication Runs', isExpanded: false },
            { sectionKey: 'mJCompanyIntegrationRuns', sectionName: 'Company Integration Runs', isExpanded: false },
            { sectionKey: 'mJConversations', sectionName: 'Conversations', isExpanded: false },
            { sectionKey: 'mJDashboardCategories', sectionName: 'Dashboard Categories', isExpanded: false },
            { sectionKey: 'mJDashboards', sectionName: 'Dashboards', isExpanded: false },
            { sectionKey: 'mJDataContexts', sectionName: 'Data Contexts', isExpanded: false },
            { sectionKey: 'mJDuplicateRuns', sectionName: 'Duplicate Runs', isExpanded: false },
            { sectionKey: 'mJLists', sectionName: 'Lists', isExpanded: false },
            { sectionKey: 'mJQueryCategories', sectionName: 'Query Categories', isExpanded: false },
            { sectionKey: 'mJRecommendationRuns', sectionName: 'Recommendation Runs', isExpanded: false },
            { sectionKey: 'mJRecordChangeReplayRuns', sectionName: 'Record Change Replay Runs', isExpanded: false },
            { sectionKey: 'mJRecordChanges', sectionName: 'Record Changes', isExpanded: false },
            { sectionKey: 'mJRecordMergeLogs', sectionName: 'Record Merge Logs', isExpanded: false },
            { sectionKey: 'mJReportCategories', sectionName: 'Report Categories', isExpanded: false },
            { sectionKey: 'mJReportSnapshots', sectionName: 'Report Snapshots', isExpanded: false },
            { sectionKey: 'mJReports', sectionName: 'Reports', isExpanded: false },
            { sectionKey: 'mJTemplateCategories', sectionName: 'Template Categories', isExpanded: false },
            { sectionKey: 'mJTemplates', sectionName: 'Templates', isExpanded: false },
            { sectionKey: 'mJUserApplications', sectionName: 'User Applications', isExpanded: false },
            { sectionKey: 'mJUserFavorites', sectionName: 'User Favorites', isExpanded: false },
            { sectionKey: 'mJUserNotifications', sectionName: 'User Notifications', isExpanded: false },
            { sectionKey: 'mJUserRecordLogs', sectionName: 'User Record Logs', isExpanded: false },
            { sectionKey: 'mJUserRoles', sectionName: 'Roles', isExpanded: false },
            { sectionKey: 'mJUserViewCategories', sectionName: 'User View Categories', isExpanded: false },
            { sectionKey: 'mJUserViewRuns', sectionName: 'User View Runs', isExpanded: false },
            { sectionKey: 'mJUserViews', sectionName: 'User Views', isExpanded: false },
            { sectionKey: 'mJWorkspaces', sectionName: 'Workspaces', isExpanded: false },
            { sectionKey: 'mJAIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJAIAgentRequestsResponseByUserID', sectionName: 'AI Agent Requests', isExpanded: false },
            { sectionKey: 'mJAPIKeysUserID', sectionName: 'API Keys (User)', isExpanded: false },
            { sectionKey: 'mJArtifactPermissionsUserID', sectionName: 'Artifact Permissions (User ID)', isExpanded: false },
            { sectionKey: 'mJArtifactUses', sectionName: 'Artifact Uses', isExpanded: false },
            { sectionKey: 'mJArtifactVersions', sectionName: 'Artifact Versions', isExpanded: false },
            { sectionKey: 'mJConversationDetailRatings', sectionName: 'Conversation Detail Ratings', isExpanded: false },
            { sectionKey: 'mJDashboardCategoryLinks', sectionName: 'Dashboard Category Links', isExpanded: false },
            { sectionKey: 'mJDashboardCategoryPermissionsUserID', sectionName: 'Dashboard Category Permissions (User ID)', isExpanded: false },
            { sectionKey: 'mJDashboardPermissionsSharedByUserID', sectionName: 'Dashboard Permissions (Shared By User ID)', isExpanded: false },
            { sectionKey: 'mJDashboardUserPreferences', sectionName: 'Dashboard User Preferences', isExpanded: false },
            { sectionKey: 'mJDashboardUserStates', sectionName: 'Dashboard User States', isExpanded: false },
            { sectionKey: 'mJListCategories', sectionName: 'List Categories', isExpanded: false },
            { sectionKey: 'mJListInvitations', sectionName: 'List Invitations', isExpanded: false },
            { sectionKey: 'mJListShares', sectionName: 'List Shares', isExpanded: false },
            { sectionKey: 'mJMCPToolExecutionLogs', sectionName: 'MCP Tool Execution Logs', isExpanded: false },
            { sectionKey: 'mJOAuthAuthorizationStates', sectionName: 'O Auth Authorization States', isExpanded: false },
            { sectionKey: 'mJOpenAppInstallHistories', sectionName: 'Open App Install Histories', isExpanded: false },
            { sectionKey: 'mJOpenApps', sectionName: 'Open Apps', isExpanded: false },
            { sectionKey: 'mJPublicLinks', sectionName: 'Public Links', isExpanded: false },
            { sectionKey: 'mJReportUserStates', sectionName: 'Report User States', isExpanded: false },
            { sectionKey: 'mJResourceLinks', sectionName: 'Resource Links', isExpanded: false },
            { sectionKey: 'mJScheduledActions', sectionName: 'Scheduled Actions', isExpanded: false },
            { sectionKey: 'mJScheduledJobRuns', sectionName: 'Scheduled Job Runs', isExpanded: false },
            { sectionKey: 'mJScheduledJobsNotifyUserID', sectionName: 'Scheduled Jobs (Notify User ID)', isExpanded: false },
            { sectionKey: 'mJTestRunFeedbacks', sectionName: 'Test Run Feedbacks', isExpanded: false },
            { sectionKey: 'mJTestSuiteRuns', sectionName: 'Test Suite Runs', isExpanded: false },
            { sectionKey: 'mJUserNotificationPreferences', sectionName: 'User Notification Preferences', isExpanded: false },
            { sectionKey: 'mJUserSettings', sectionName: 'User Settings', isExpanded: false },
            { sectionKey: 'mJVersionLabelRestores', sectionName: 'Version Label Restores', isExpanded: false },
            { sectionKey: 'mJAccessControlRules', sectionName: 'Access Control Rules', isExpanded: false },
            { sectionKey: 'mJAIAgentRequestsRequestForUserID', sectionName: 'AI Agent Requests', isExpanded: false },
            { sectionKey: 'mJAPIKeysCreatedByUserID', sectionName: 'API Keys (Created By User)', isExpanded: false },
            { sectionKey: 'mJArtifactPermissionsSharedByUserID', sectionName: 'Artifact Permissions (Shared By User ID)', isExpanded: false },
            { sectionKey: 'mJArtifacts', sectionName: 'Artifacts', isExpanded: false },
            { sectionKey: 'mJCollectionPermissionsSharedByUserID', sectionName: 'Collection Permissions (Shared By User ID)', isExpanded: false },
            { sectionKey: 'mJConversationDetails', sectionName: 'Conversation Details', isExpanded: false },
            { sectionKey: 'mJDashboardCategoryPermissionsSharedByUserID', sectionName: 'Dashboard Category Permissions (Shared By User ID)', isExpanded: false },
            { sectionKey: 'mJDashboardPermissionsUserID', sectionName: 'Dashboard Permissions (User ID)', isExpanded: false },
            { sectionKey: 'mJMCPServerConnectionPermissions', sectionName: 'MCP Server Connection Permissions', isExpanded: false },
            { sectionKey: 'mJResourcePermissions', sectionName: 'Resource Permissions', isExpanded: false },
            { sectionKey: 'mJScheduledJobsOwnerUserID', sectionName: 'Scheduled Jobs (Owner User ID)', isExpanded: false },
            { sectionKey: 'mJTestRuns', sectionName: 'Test Runs', isExpanded: false },
            { sectionKey: 'mJVersionLabels', sectionName: 'Version Labels', isExpanded: false },
            { sectionKey: 'mJAIAgentPermissions', sectionName: 'AI Agent Permissions', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJCollectionPermissionsUserID', sectionName: 'Collection Permissions (User ID)', isExpanded: false },
            { sectionKey: 'mJCollections', sectionName: 'Collections', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'AI Agent Examples', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'Tasks', isExpanded: false },
            { sectionKey: 'mJAIAgents', sectionName: 'AI Agents', isExpanded: false }
        ]);
    }
}

