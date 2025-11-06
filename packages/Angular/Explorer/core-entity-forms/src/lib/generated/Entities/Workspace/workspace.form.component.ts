import { Component } from '@angular/core';
import { WorkspaceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Workspaces') // Tell MemberJunction about this class
@Component({
    selector: 'gen-workspace-form',
    templateUrl: './workspace.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WorkspaceFormComponent extends BaseFormComponent {
    public record!: WorkspaceEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        workspaceItems: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadWorkspaceFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
