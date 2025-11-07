import { Component } from '@angular/core';
import { ActionContextEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Action Contexts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actioncontext-form',
    templateUrl: './actioncontext.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionContextFormComponent extends BaseFormComponent {
    public record!: ActionContextEntity;

    // Collapsible section state
    public sectionsExpanded = {
        actionCore: true,
        contextMapping: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadActionContextFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
