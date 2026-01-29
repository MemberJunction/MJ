import { Component } from '@angular/core';
import { EntityActionInvocationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Action Invocations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityactioninvocation-form',
    templateUrl: './entityactioninvocation.form.component.html'
})
export class EntityActionInvocationFormComponent extends BaseFormComponent {
    public record!: EntityActionInvocationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'invocationConfiguration', sectionName: 'Invocation Configuration', isExpanded: true },
            { sectionKey: 'invocationStatus', sectionName: 'Invocation Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadEntityActionInvocationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
