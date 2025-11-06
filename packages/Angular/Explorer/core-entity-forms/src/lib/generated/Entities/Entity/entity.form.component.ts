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
        details: true,
        audit: true,
        aPI: false,
        dB: false,
        uI: false,
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

export function LoadEntityFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
