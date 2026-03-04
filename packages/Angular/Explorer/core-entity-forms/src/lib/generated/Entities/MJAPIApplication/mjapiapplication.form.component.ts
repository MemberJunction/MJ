import { Component } from '@angular/core';
import { MJAPIApplicationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: API Applications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapiapplication-form',
    templateUrl: './mjapiapplication.form.component.html'
})
export class MJAPIApplicationFormComponent extends BaseFormComponent {
    public record!: MJAPIApplicationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'applicationDetails', sectionName: 'Application Details', isExpanded: true },
            { sectionKey: 'operationalStatus', sectionName: 'Operational Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAPIApplicationScopes', sectionName: 'API Application Scopes', isExpanded: false },
            { sectionKey: 'mJAPIKeyUsageLogs', sectionName: 'API Key Usage Logs', isExpanded: false },
            { sectionKey: 'mJAPIKeyApplications', sectionName: 'API Key Applications', isExpanded: false }
        ]);
    }
}

