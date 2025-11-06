import { Component } from '@angular/core';
import { EntityActionInvocationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Action Invocations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityactioninvocation-form',
    templateUrl: './entityactioninvocation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityActionInvocationFormComponent extends BaseFormComponent {
    public record!: EntityActionInvocationEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntityActionInvocationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
