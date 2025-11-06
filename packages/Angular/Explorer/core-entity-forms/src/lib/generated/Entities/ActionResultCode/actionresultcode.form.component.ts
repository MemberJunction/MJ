import { Component } from '@angular/core';
import { ActionResultCodeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Action Result Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionresultcode-form',
    templateUrl: './actionresultcode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionResultCodeFormComponent extends BaseFormComponent {
    public record!: ActionResultCodeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadActionResultCodeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
