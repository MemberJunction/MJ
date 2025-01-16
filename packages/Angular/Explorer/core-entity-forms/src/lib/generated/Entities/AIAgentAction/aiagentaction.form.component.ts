import { Component } from '@angular/core';
import { AIAgentActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentActionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'AI Agent Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentaction-form',
    templateUrl: './aiagentaction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentActionFormComponent extends BaseFormComponent {
    public record!: AIAgentActionEntity;
} 

export function LoadAIAgentActionFormComponent() {
    LoadAIAgentActionDetailsComponent();
}
