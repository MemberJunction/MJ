import { Component } from '@angular/core';
import { APIKeyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: API Keys') // Tell MemberJunction about this class
@Component({
    selector: 'gen-apikey-form',
    templateUrl: './apikey.form.component.html'
})
export class APIKeyFormComponent extends BaseFormComponent {
    public record!: APIKeyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'keyInformation', sectionName: 'Key Information', isExpanded: true },
            { sectionKey: 'ownership', sectionName: 'Ownership', isExpanded: true },
            { sectionKey: 'statusUsage', sectionName: 'Status & Usage', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAPIKeyScopes', sectionName: 'MJ: API Key Scopes', isExpanded: false },
            { sectionKey: 'mJAPIKeyUsageLogs', sectionName: 'MJ: API Key Usage Logs', isExpanded: false }
        ]);
    }
}

export function LoadAPIKeyFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
