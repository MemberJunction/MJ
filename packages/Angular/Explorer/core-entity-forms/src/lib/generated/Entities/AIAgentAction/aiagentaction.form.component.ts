import { Component } from '@angular/core';
import { AIAgentActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'AI Agent Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentaction-form',
    templateUrl: './aiagentaction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentActionFormComponent extends BaseFormComponent {
    public record!: AIAgentActionEntity;

    // Collapsible section state
    public sectionsExpanded = {
        mappingRelationships: true,
        auditStatus: true,
        executionConstraints: false,
        resultCompaction: false,
        systemMetadata: false
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
            const matches = sectionName.includes(searchTerm) || fieldNames.includes(searchTerm);

            if (matches) {
                panel.classList.remove('search-hidden');

                // Add highlighting to matched text in section name
                if (searchTerm && sectionName.includes(searchTerm)) {
                    const h3 = panel.querySelector('.collapsible-title h3 .section-name');
                    if (h3) {
                        const originalText = h3.textContent || '';
                        const regex = new RegExp(`(${searchTerm})`, 'gi');
                        h3.innerHTML = originalText.replace(regex, '<span class="search-highlight">$1</span>');
                    }
                }
            } else {
                panel.classList.add('search-hidden');
            }
        });

        // Clear highlighting when search is empty
        if (!searchTerm) {
            panels.forEach((panel: Element) => {
                const h3 = panel.querySelector('.collapsible-title h3 .section-name');
                if (h3) {
                    h3.innerHTML = h3.textContent || '';
                }
            });
        }
    }
}

export function LoadAIAgentActionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
