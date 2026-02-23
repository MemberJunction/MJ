import { Component } from '@angular/core';
import { MJAPIScopesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: API Scopes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapiscopes-form',
    templateUrl: './mjapiscopes.form.component.html'
})
export class MJAPIScopesFormComponent extends BaseFormComponent {
    public record!: MJAPIScopesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'scopeDefinition', sectionName: 'Scope Definition', isExpanded: true },
            { sectionKey: 'scopeHierarchy', sectionName: 'Scope Hierarchy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAPIApplicationScopes', sectionName: 'MJ: API Application Scopes', isExpanded: false },
            { sectionKey: 'mJAPIKeyScopes', sectionName: 'MJ: API Key Scopes', isExpanded: false },
            { sectionKey: 'mJAPIScopes', sectionName: 'MJ: API Scopes', isExpanded: false }
        ]);
    }
}

