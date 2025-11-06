import { Component } from '@angular/core';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'AI Agents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagent-form',
    templateUrl: './aiagent.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentFormComponent extends BaseFormComponent {
    public record!: AIAgentEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        aIAgentActions: false,
        aIAgentLearningCycles: false,
        aIAgentModels: false,
        aIAgentRequests: false,
        mJAIAgentArtifactTypes: false,
        mJAIAgentDataSources: false,
        mJAIAgentPermissions: false,
        mJAIAgentRelationships: false,
        mJAIAgentSteps: false,
        aIAgentNotes: false,
        mJAIAgentExamples: false,
        mJAIAgentPrompts: false,
        mJAIAgentRelationships1: false,
        mJAIAgentRuns: false,
        mJAIAgentSteps1: false,
        mJTasks: false,
        aIResultCache: false,
        mJAIPromptRuns: false,
        conversationDetails: false,
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

export function LoadAIAgentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
