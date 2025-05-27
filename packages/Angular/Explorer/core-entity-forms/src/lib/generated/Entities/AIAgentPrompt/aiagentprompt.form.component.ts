import { Component } from '@angular/core';
import { AIAgentPromptEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentPromptDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Prompts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentprompt-form',
    templateUrl: './aiagentprompt.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentPromptFormComponent extends BaseFormComponent {
    public record!: AIAgentPromptEntity;
} 

export function LoadAIAgentPromptFormComponent() {
    LoadAIAgentPromptDetailsComponent();
}
