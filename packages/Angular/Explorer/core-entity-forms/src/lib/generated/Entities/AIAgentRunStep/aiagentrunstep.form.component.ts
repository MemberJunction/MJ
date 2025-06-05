import { Component } from '@angular/core';
import { AIAgentRunStepEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentRunStepDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Run Steps') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentrunstep-form',
    templateUrl: './aiagentrunstep.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentRunStepFormComponent extends BaseFormComponent {
    public record!: AIAgentRunStepEntity;
} 

export function LoadAIAgentRunStepFormComponent() {
    LoadAIAgentRunStepDetailsComponent();
}
