import { Component } from '@angular/core';
import { EntityActionInvocationTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Entity Action Invocation Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityactioninvocationtype-form',
    templateUrl: './entityactioninvocationtype.form.component.html'
})
export class EntityActionInvocationTypeFormComponent extends BaseFormComponent {
    public record!: EntityActionInvocationTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'invocationTypeDefinition', sectionName: 'Invocation Type Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityActionInvocations', sectionName: 'Entity Action Invocations', isExpanded: false }
        ]);
    }
}

export function LoadEntityActionInvocationTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
