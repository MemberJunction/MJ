import { Component } from '@angular/core';
import { EntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Entities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entity-form',
    templateUrl: './entity.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityFormComponent extends BaseFormComponent {
    public record!: EntityEntity;

    // Collapsible section state
    public sectionsExpanded = {
        identityStructure: true,
        userInterfaceCustomization: true,
        auditingLifecycle: false,
        aPISearchSettings: false,
        proceduresDeletion: false,
        rowStatistics: false,
        systemMetadata: false,
        applicationEntities: false,
        auditLogs: false,
        companyIntegrationRecordMaps: false,
        companyIntegrationRunDetails: false,
        conversations: false,
        dataContextItems: false,
        datasetItems: false,
        duplicateRuns: false,
        entities: false,
        entityActions: false,
        aIActions: false,
        entityCommunicationMessageTypes: false,
        entityDocuments: false,
        fields: false,
        permissions: false,
        entityRecordDocuments: false,
        relationships: false,
        entitySettings: false,
        fileEntityRecordLinks: false,
        integrationURLFormats: false,
        lists: false,
        queryFields: false,
        recommendationItems: false,
        recommendations: false,
        recordChanges: false,
        recordMergeLogs: false,
        resourceTypes: false,
        taggedItems: false,
        templateParams: false,
        userApplicationEntities: false,
        userFavorites: false,
        userRecordLogs: false,
        userViewCategories: false,
        userViews: false,
        users: false,
        mJAccessControlRules: false,
        mJRecordLinks: false,
        queryEntities: false,
        generatedCodes: false,
        mJRecordLinks1: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

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

export function LoadEntityFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
