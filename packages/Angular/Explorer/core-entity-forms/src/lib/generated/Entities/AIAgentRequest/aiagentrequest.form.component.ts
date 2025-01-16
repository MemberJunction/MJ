import { Component } from '@angular/core';
import { AIAgentRequestEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentRequestDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'AI Agent Requests') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentrequest-form',
    templateUrl: './aiagentrequest.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentRequestFormComponent extends BaseFormComponent {
    public record!: AIAgentRequestEntity;
} 

export function LoadAIAgentRequestFormComponent() {
    LoadAIAgentRequestDetailsComponent();
}
