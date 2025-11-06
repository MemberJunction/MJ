import { Component } from '@angular/core';
import { UserApplicationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'User Applications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userapplication-form',
    templateUrl: './userapplication.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserApplicationFormComponent extends BaseFormComponent {
    public record!: UserApplicationEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        entities: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadUserApplicationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
