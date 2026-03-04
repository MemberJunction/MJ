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
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJCompanyIntegrationFieldMaps', sectionName: 'MJ: Company Integration Field Maps', isExpanded: false },
            { sectionKey: 'mJCompanyIntegrationSyncWatermarks', sectionName: 'MJ: Company Integration Sync Watermarks', isExpanded: false }
        ]);
    }
}

