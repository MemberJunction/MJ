import { Component } from '@angular/core';
import { ConversationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Conversations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversation-form',
    templateUrl: './conversation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationFormComponent extends BaseFormComponent {
    public record!: ConversationEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        conversationDetails: false,
        reports: false,
        mJConversationArtifacts: false,
        aIAgentNotes: false,
        mJAIAgentRuns: false,
        mJAIAgentExamples: false
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
            if (sectionName.includes(searchTerm)) {
                panel.classList.remove('search-hidden');
            } else {
                panel.classList.add('search-hidden');
            }
        });
    }
}

export function LoadConversationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
