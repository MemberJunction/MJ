import { Component } from '@angular/core';
import { MJIntegrationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Integrations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjintegrations-form',
    templateUrl: './mjintegrations.form.component.html'
})
export class MJIntegrationsFormComponent extends BaseFormComponent {
    public record!: MJIntegrationsEntity;

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

