import { Component } from '@angular/core';
import { MJIntegrationSourceTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Integration Source Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjintegrationsourcetype-form',
    templateUrl: './mjintegrationsourcetype.form.component.html'
})
export class MJIntegrationSourceTypeFormComponent extends BaseFormComponent {
    public record!: MJIntegrationSourceTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJCompanyIntegrations', sectionName: 'MJ: Company Integrations', isExpanded: false }
        ]);
    }
}

