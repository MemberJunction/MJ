import { Component } from '@angular/core';
import { UserViewRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'User View Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userviewrun-form',
    templateUrl: './userviewrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserViewRunFormComponent extends BaseFormComponent {
    public record!: UserViewRunEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        details1: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadUserViewRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
