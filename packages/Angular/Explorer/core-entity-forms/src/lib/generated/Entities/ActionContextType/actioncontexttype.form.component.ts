import { Component } from '@angular/core';
import { ActionContextTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Action Context Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actioncontexttype-form',
    templateUrl: './actioncontexttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionContextTypeFormComponent extends BaseFormComponent {
    public record!: ActionContextTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        actionContexts: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadActionContextTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
