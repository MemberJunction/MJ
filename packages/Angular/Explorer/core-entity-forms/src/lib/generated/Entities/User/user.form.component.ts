import { Component } from '@angular/core';
import { UserEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Users') // Tell MemberJunction about this class
@Component({
    selector: 'gen-user-form',
    templateUrl: './user.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserFormComponent extends BaseFormComponent {
    public record!: UserEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        actionExecutionLogs: false,
        actions: false,
        auditLogs: false,
        communicationRuns: false,
        companyIntegrationRuns: false,
        conversations: false,
        dashboardCategories: false,
        dashboards: false,
        dataContexts: false,
        duplicateRuns: false,
        lists: false,
        queryCategories: false,
        recommendationRuns: false,
        recordChangeReplayRuns: false,
        recordChanges: false,
        recordMergeLogs: false,
        reportCategories: false,
        reportSnapshots: false,
        reports: false,
        templateCategories: false,
        templates: false,
        userApplications: false,
        userFavorites: false,
        userNotifications: false,
        userRecordLogs: false,
        roles: false,
        userViewCategories: false,
        userViewRuns: false,
        userViews: false,
        workspaces: false,
        aIAgentNotes: false,
        aIAgentRequests: false,
        listCategories: false,
        mJArtifactPermissions: false,
        mJArtifactUses: false,
        mJArtifactVersions: false,
        mJConversationDetailRatings: false,
        mJDashboardUserPreferences: false,
        mJDashboardUserStates: false,
        mJPublicLinks: false,
        mJReportUserStates: false,
        mJScheduledJobRuns: false,
        mJScheduledJobs: false,
        resourceLinks: false,
        scheduledActions: false,
        aIAgentRequests1: false,
        conversationDetails: false,
        mJAccessControlRules: false,
        mJArtifactPermissions1: false,
        mJArtifacts: false,
        mJCollectionPermissions: false,
        mJScheduledJobs1: false,
        resourcePermissions: false,
        mJAIAgentPermissions: false,
        mJAIAgentRuns: false,
        mJCollectionPermissions1: false,
        mJCollections: false,
        mJAIAgentExamples: false,
        mJTasks: false,
        aIAgents: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }

    public expandAllSections(): void {
        Object.keys(this.sectionsExpanded).forEach(key => {
            this.sectionsExpanded[key as keyof typeof this.sectionsExpanded] = true;
        });
    }

    public collapseAllSections(): void {
        Object.keys(this.sectionsExpanded).forEach(key => {
            this.sectionsExpanded[key as keyof typeof this.sectionsExpanded] = false;
        });
    }

    public getExpandedCount(): number {
        return Object.values(this.sectionsExpanded).filter(v => v === true).length;
    }

    public filterSections(event: Event): void {
        const searchTerm = (event.target as HTMLInputElement).value.toLowerCase();
        const panels = document.querySelectorAll('.form-card.collapsible-card');

        panels.forEach((panel: Element) => {
            const sectionName = panel.getAttribute('data-section-name') || '';
            const fieldNames = panel.getAttribute('data-field-names') || '';

            // Show section if search term matches section name OR any field name
            if (sectionName.includes(searchTerm) || fieldNames.includes(searchTerm)) {
                panel.classList.remove('search-hidden');
            } else {
                panel.classList.add('search-hidden');
            }
        });
    }
}

export function LoadUserFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
