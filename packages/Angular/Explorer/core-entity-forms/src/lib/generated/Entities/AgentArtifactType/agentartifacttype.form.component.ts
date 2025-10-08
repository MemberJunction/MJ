import { Component } from '@angular/core';
import { AgentArtifactTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAgentArtifactTypeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Agent Artifact Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-agentartifacttype-form',
    templateUrl: './agentartifacttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AgentArtifactTypeFormComponent extends BaseFormComponent {
    public record!: AgentArtifactTypeEntity;
} 

export function LoadAgentArtifactTypeFormComponent() {
    LoadAgentArtifactTypeDetailsComponent();
}
