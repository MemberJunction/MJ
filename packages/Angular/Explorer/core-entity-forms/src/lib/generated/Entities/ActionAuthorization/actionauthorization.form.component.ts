import { Component } from '@angular/core';
import { ActionAuthorizationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Action Authorizations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionauthorization-form',
    templateUrl: './actionauthorization.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionAuthorizationFormComponent extends BaseFormComponent {
    public record!: ActionAuthorizationEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadActionAuthorizationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
