import { Component } from '@angular/core';
import { APIKeyScopeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: API Key Scopes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-apikeyscope-form',
    templateUrl: './apikeyscope.form.component.html'
})
export class APIKeyScopeFormComponent extends BaseFormComponent {
    public record!: APIKeyScopeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'keyScopeMapping', sectionName: 'Key Scope Mapping', isExpanded: true },
            { sectionKey: 'accessRules', sectionName: 'Access Rules', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadAPIKeyScopeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
