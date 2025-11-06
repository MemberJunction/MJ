import { Component } from '@angular/core';
import { QueryPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Query Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-querypermission-form',
    templateUrl: './querypermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueryPermissionFormComponent extends BaseFormComponent {
    public record!: QueryPermissionEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadQueryPermissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
