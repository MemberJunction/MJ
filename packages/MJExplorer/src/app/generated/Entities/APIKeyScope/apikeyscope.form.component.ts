import { Component } from '@angular/core';
import { APIKeyScopeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'API Key Scopes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-apikeyscope-form',
    templateUrl: './apikeyscope.form.component.html'
})
export class APIKeyScopeFormComponent extends BaseFormComponent {
    public record!: APIKeyScopeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'aPIKeyScopeMapping', sectionName: 'API Key Scope Mapping', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadAPIKeyScopeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
