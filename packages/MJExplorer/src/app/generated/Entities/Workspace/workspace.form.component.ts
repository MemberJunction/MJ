import { Component } from '@angular/core';
import { WorkspaceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadWorkspaceDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Workspaces') // Tell MemberJunction about this class
@Component({
    selector: 'gen-workspace-form',
    templateUrl: './workspace.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WorkspaceFormComponent extends BaseFormComponent {
    public record: WorkspaceEntity | null = null;
} 

export function LoadWorkspaceFormComponent() {
    LoadWorkspaceDetailsComponent();
}
