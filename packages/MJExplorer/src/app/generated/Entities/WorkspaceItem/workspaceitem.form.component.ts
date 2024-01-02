import { Component } from '@angular/core';
import { WorkspaceItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadWorkspaceItemDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Workspace Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-workspaceitem-form',
    templateUrl: './workspaceitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WorkspaceItemFormComponent extends BaseFormComponent {
    public record: WorkspaceItemEntity | null = null;
} 

export function LoadWorkspaceItemFormComponent() {
    LoadWorkspaceItemDetailsComponent();
}
