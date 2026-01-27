import { Component } from '@angular/core';
import { APIKeyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'API Keys') // Tell MemberJunction about this class
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
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'aPIKeyScopes', sectionName: 'API Key Scopes', isExpanded: false }
        ]);
    }
}

export function LoadAPIKeyFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
