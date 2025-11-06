import { Component } from '@angular/core';
import { WorkspaceItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Workspace Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-workspaceitem-form',
    templateUrl: './workspaceitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WorkspaceItemFormComponent extends BaseFormComponent {
    public record!: WorkspaceItemEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadWorkspaceItemFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
