import { Component } from '@angular/core';
import { AIAgentRelationshipEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentRelationshipDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Relationships') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentrelationship-form',
    templateUrl: './aiagentrelationship.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentRelationshipFormComponent extends BaseFormComponent {
    public record!: AIAgentRelationshipEntity;
} 

export function LoadAIAgentRelationshipFormComponent() {
    LoadAIAgentRelationshipDetailsComponent();
}
