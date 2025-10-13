import { Component } from '@angular/core';
import { AIAgentPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentPermissionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentpermission-form',
    templateUrl: './aiagentpermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentPermissionFormComponent extends BaseFormComponent {
    public record!: AIAgentPermissionEntity;
} 

export function LoadAIAgentPermissionFormComponent() {
    LoadAIAgentPermissionDetailsComponent();
}
