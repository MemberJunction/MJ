import { Component } from '@angular/core';
import { UserApplicationEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'User Application Entities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userapplicationentity-form',
    templateUrl: './userapplicationentity.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserApplicationEntityFormComponent extends BaseFormComponent {
    public record!: UserApplicationEntityEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadUserApplicationEntityFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
