import { Component } from '@angular/core';
import { AIAgentLearningCycleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentLearningCycleDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'AIAgent Learning Cycles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentlearningcycle-form',
    templateUrl: './aiagentlearningcycle.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentLearningCycleFormComponent extends BaseFormComponent {
    public record!: AIAgentLearningCycleEntity;
} 

export function LoadAIAgentLearningCycleFormComponent() {
    LoadAIAgentLearningCycleDetailsComponent();
}
