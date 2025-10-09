import { Component } from '@angular/core';
import { AIAgentArtifactTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentArtifactTypeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Artifact Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentartifacttype-form',
    templateUrl: './aiagentartifacttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentArtifactTypeFormComponent extends BaseFormComponent {
    public record!: AIAgentArtifactTypeEntity;
} 

export function LoadAIAgentArtifactTypeFormComponent() {
    LoadAIAgentArtifactTypeDetailsComponent();
}
