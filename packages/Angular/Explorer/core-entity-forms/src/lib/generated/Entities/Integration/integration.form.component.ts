import { Component } from '@angular/core';
import { IntegrationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Integrations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-integration-form',
    templateUrl: './integration.form.component.html'
})
export class IntegrationFormComponent extends BaseFormComponent {
    public record!: IntegrationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'integrationOverview', sectionName: 'Integration Overview', isExpanded: true },
            { sectionKey: 'technicalSettings', sectionName: 'Technical Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'companyIntegrations', sectionName: 'Company Integrations', isExpanded: false },
            { sectionKey: 'uRLFormats', sectionName: 'URL Formats', isExpanded: false },
            { sectionKey: 'recordChanges', sectionName: 'Record Changes', isExpanded: false }
        ]);
    }
}

export function LoadIntegrationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
