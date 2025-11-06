import { Component } from '@angular/core';
import { RowLevelSecurityFilterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Row Level Security Filters') // Tell MemberJunction about this class
@Component({
    selector: 'gen-rowlevelsecurityfilter-form',
    templateUrl: './rowlevelsecurityfilter.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RowLevelSecurityFilterFormComponent extends BaseFormComponent {
    public record!: RowLevelSecurityFilterEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        entityPermissions: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadRowLevelSecurityFilterFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
