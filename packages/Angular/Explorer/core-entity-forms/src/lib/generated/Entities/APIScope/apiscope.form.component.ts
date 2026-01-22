import { Component } from '@angular/core';
import { APIScopeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: API Scopes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-apiscope-form',
    templateUrl: './apiscope.form.component.html'
})
export class APIScopeFormComponent extends BaseFormComponent {
    public record!: APIScopeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'scopeDefinition', sectionName: 'Scope Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAPIKeyScopes', sectionName: 'MJ: API Key Scopes', isExpanded: false }
        ]);
    }
}

export function LoadAPIScopeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
