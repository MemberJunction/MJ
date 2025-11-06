import { Component } from '@angular/core';
import { AccessControlRuleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Access Control Rules') // Tell MemberJunction about this class
@Component({
    selector: 'gen-accesscontrolrule-form',
    templateUrl: './accesscontrolrule.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AccessControlRuleFormComponent extends BaseFormComponent {
    public record!: AccessControlRuleEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAccessControlRuleFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
