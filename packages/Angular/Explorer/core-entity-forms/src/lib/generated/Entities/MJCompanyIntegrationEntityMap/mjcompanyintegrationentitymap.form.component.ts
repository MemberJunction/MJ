import { Component } from '@angular/core';
import { MJCompanyIntegrationEntityMapEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Company Integration Entity Maps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcompanyintegrationentitymap-form',
    templateUrl: './mjcompanyintegrationentitymap.form.component.html'
})
export class MJCompanyIntegrationEntityMapFormComponent extends BaseFormComponent {
    public record!: MJCompanyIntegrationEntityMapEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'objectMapping', sectionName: 'Object Mapping', isExpanded: true },
            { sectionKey: 'syncControl', sectionName: 'Sync Control', isExpanded: true },
            { sectionKey: 'engineConfiguration', sectionName: 'Engine Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJCompanyIntegrationFieldMaps', sectionName: 'Company Integration Field Maps', isExpanded: false },
            { sectionKey: 'mJCompanyIntegrationSyncWatermarks', sectionName: 'Company Integration Sync Watermarks', isExpanded: false }
        ]);
    }
}

