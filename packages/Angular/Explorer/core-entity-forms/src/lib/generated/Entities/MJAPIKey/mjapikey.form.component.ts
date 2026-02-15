import { Component } from '@angular/core';
import { MJAPIKeyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: API Keys') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapikey-form',
    templateUrl: './mjapikey.form.component.html'
})
export class MJAPIKeyFormComponent extends BaseFormComponent {
    public record!: MJAPIKeyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'keyInformation', sectionName: 'Key Information', isExpanded: true },
            { sectionKey: 'ownership', sectionName: 'Ownership', isExpanded: true },
            { sectionKey: 'statusUsage', sectionName: 'Status & Usage', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAPIKeyApplications', sectionName: 'MJ: API Key Applications', isExpanded: false },
            { sectionKey: 'mJAPIKeyScopes', sectionName: 'MJ: API Key Scopes', isExpanded: false },
            { sectionKey: 'mJAPIKeyUsageLogs', sectionName: 'MJ: API Key Usage Logs', isExpanded: false }
        ]);
    }
}

