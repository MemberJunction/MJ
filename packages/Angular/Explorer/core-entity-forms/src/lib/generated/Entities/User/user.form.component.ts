import { Component } from '@angular/core';
import { UserEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Users') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-user-form',
    templateUrl: './user.form.component.html'
})
export class UserFormComponent extends BaseFormComponent {
    public record!: UserEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'userIdentity', sectionName: 'User Identity', isExpanded: true },
            { sectionKey: 'accountSettings', sectionName: 'Account Settings', isExpanded: true },
            { sectionKey: 'entityLinks', sectionName: 'Entity Links', isExpanded: false },
            { sectionKey: 'employeeDetails', sectionName: 'Employee Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'actionExecutionLogs', sectionName: 'Action Execution Logs', isExpanded: false },
            { sectionKey: 'actions', sectionName: 'Actions', isExpanded: false },
            { sectionKey: 'auditLogs', sectionName: 'Audit Logs', isExpanded: false },
            { sectionKey: 'communicationRuns', sectionName: 'Communication Runs', isExpanded: false },
            { sectionKey: 'companyIntegrationRuns', sectionName: 'Company Integration Runs', isExpanded: false },
            { sectionKey: 'conversations', sectionName: 'Conversations', isExpanded: false },
            { sectionKey: 'dashboardCategories', sectionName: 'Dashboard Categories', isExpanded: false },
            { sectionKey: 'dashboards', sectionName: 'Dashboards', isExpanded: false },
            { sectionKey: 'dataContexts', sectionName: 'Data Contexts', isExpanded: false },
            { sectionKey: 'duplicateRuns', sectionName: 'Duplicate Runs', isExpanded: false },
            { sectionKey: 'lists', sectionName: 'Lists', isExpanded: false },
            { sectionKey: 'queryCategories', sectionName: 'Query Categories', isExpanded: false },
            { sectionKey: 'recommendationRuns', sectionName: 'Recommendation Runs', isExpanded: false },
            { sectionKey: 'recordChangeReplayRuns', sectionName: 'Record Change Replay Runs', isExpanded: false },
            { sectionKey: 'recordChanges', sectionName: 'Record Changes', isExpanded: false },
            { sectionKey: 'recordMergeLogs', sectionName: 'Record Merge Logs', isExpanded: false },
            { sectionKey: 'reportCategories', sectionName: 'Report Categories', isExpanded: false },
            { sectionKey: 'reportSnapshots', sectionName: 'Report Snapshots', isExpanded: false },
            { sectionKey: 'reports', sectionName: 'Reports', isExpanded: false },
            { sectionKey: 'templateCategories', sectionName: 'Template Categories', isExpanded: false },
            { sectionKey: 'templates', sectionName: 'Templates', isExpanded: false },
            { sectionKey: 'userApplications', sectionName: 'User Applications', isExpanded: false },
            { sectionKey: 'userFavorites', sectionName: 'User Favorites', isExpanded: false },
            { sectionKey: 'userNotifications', sectionName: 'User Notifications', isExpanded: false },
            { sectionKey: 'userRecordLogs', sectionName: 'User Record Logs', isExpanded: false },
            { sectionKey: 'roles', sectionName: 'Roles', isExpanded: false },
            { sectionKey: 'userViewCategories', sectionName: 'User View Categories', isExpanded: false },
            { sectionKey: 'userViewRuns', sectionName: 'User View Runs', isExpanded: false },
            { sectionKey: 'userViews', sectionName: 'User Views', isExpanded: false },
            { sectionKey: 'workspaces', sectionName: 'Workspaces', isExpanded: false },
            { sectionKey: 'aIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'aIAgentRequests', sectionName: 'AI Agent Requests', isExpanded: false },
            { sectionKey: 'listCategories', sectionName: 'List Categories', isExpanded: false },
            { sectionKey: 'mJAPIKeys', sectionName: 'MJ: API Keys', isExpanded: false },
            { sectionKey: 'mJArtifactPermissions', sectionName: 'MJ: Artifact Permissions', isExpanded: false },
            { sectionKey: 'mJArtifactUses', sectionName: 'MJ: Artifact Uses', isExpanded: false },
            { sectionKey: 'mJArtifactVersions', sectionName: 'MJ: Artifact Versions', isExpanded: false },
            { sectionKey: 'mJConversationDetailRatings', sectionName: 'MJ: Conversation Detail Ratings', isExpanded: false },
            { sectionKey: 'mJDashboardCategoryLinks', sectionName: 'MJ: Dashboard Category Links', isExpanded: false },
            { sectionKey: 'mJDashboardCategoryPermissions', sectionName: 'MJ: Dashboard Category Permissions', isExpanded: false },
            { sectionKey: 'mJDashboardPermissions', sectionName: 'MJ: Dashboard Permissions', isExpanded: false },
            { sectionKey: 'mJDashboardUserPreferences', sectionName: 'MJ: Dashboard User Preferences', isExpanded: false },
            { sectionKey: 'mJDashboardUserStates', sectionName: 'MJ: Dashboard User States', isExpanded: false },
            { sectionKey: 'mJListInvitations', sectionName: 'MJ: List Invitations', isExpanded: false },
            { sectionKey: 'mJListShares', sectionName: 'MJ: List Shares', isExpanded: false },
            { sectionKey: 'mJMCPToolExecutionLogs', sectionName: 'MJ: MCP Tool Execution Logs', isExpanded: false },
            { sectionKey: 'mJOAuthAuthorizationStates', sectionName: 'MJ: O Auth Authorization States', isExpanded: false },
            { sectionKey: 'mJPublicLinks', sectionName: 'MJ: Public Links', isExpanded: false },
            { sectionKey: 'mJReportUserStates', sectionName: 'MJ: Report User States', isExpanded: false },
            { sectionKey: 'mJScheduledJobRuns', sectionName: 'MJ: Scheduled Job Runs', isExpanded: false },
            { sectionKey: 'mJScheduledJobs', sectionName: 'MJ: Scheduled Jobs', isExpanded: false },
            { sectionKey: 'mJTestRunFeedbacks', sectionName: 'MJ: Test Run Feedbacks', isExpanded: false },
            { sectionKey: 'mJTestSuiteRuns', sectionName: 'MJ: Test Suite Runs', isExpanded: false },
            { sectionKey: 'mJUserNotificationPreferences', sectionName: 'MJ: User Notification Preferences', isExpanded: false },
            { sectionKey: 'mJUserSettings', sectionName: 'MJ: User Settings', isExpanded: false },
            { sectionKey: 'mJVersionLabelRestores', sectionName: 'MJ: Version Label Restores', isExpanded: false },
            { sectionKey: 'resourceLinks', sectionName: 'Resource Links', isExpanded: false },
            { sectionKey: 'scheduledActions', sectionName: 'Scheduled Actions', isExpanded: false },
            { sectionKey: 'aIAgentRequests1', sectionName: 'AI Agent Requests', isExpanded: false },
            { sectionKey: 'conversationDetails', sectionName: 'Conversation Details', isExpanded: false },
            { sectionKey: 'mJAccessControlRules', sectionName: 'MJ: Access Control Rules', isExpanded: false },
            { sectionKey: 'mJAPIKeys1', sectionName: 'MJ: API Keys', isExpanded: false },
            { sectionKey: 'mJArtifactPermissions1', sectionName: 'MJ: Artifact Permissions', isExpanded: false },
            { sectionKey: 'mJArtifacts', sectionName: 'MJ: Artifacts', isExpanded: false },
            { sectionKey: 'mJCollectionPermissions', sectionName: 'MJ: Collection Permissions', isExpanded: false },
            { sectionKey: 'mJDashboardCategoryPermissions1', sectionName: 'MJ: Dashboard Category Permissions', isExpanded: false },
            { sectionKey: 'mJDashboardPermissions1', sectionName: 'MJ: Dashboard Permissions', isExpanded: false },
            { sectionKey: 'mJMCPServerConnectionPermissions', sectionName: 'MJ: MCP Server Connection Permissions', isExpanded: false },
            { sectionKey: 'mJScheduledJobs1', sectionName: 'MJ: Scheduled Jobs', isExpanded: false },
            { sectionKey: 'mJTestRuns', sectionName: 'MJ: Test Runs', isExpanded: false },
            { sectionKey: 'mJVersionLabels', sectionName: 'MJ: Version Labels', isExpanded: false },
            { sectionKey: 'resourcePermissions', sectionName: 'Resource Permissions', isExpanded: false },
            { sectionKey: 'mJAIAgentPermissions', sectionName: 'MJ: AI Agent Permissions', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'MJ: AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJCollectionPermissions1', sectionName: 'MJ: Collection Permissions', isExpanded: false },
            { sectionKey: 'mJCollections', sectionName: 'MJ: Collections', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'MJ: AI Agent Examples', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'MJ: Tasks', isExpanded: false },
            { sectionKey: 'aIAgents', sectionName: 'AI Agents', isExpanded: false }
        ]);
    }
}

