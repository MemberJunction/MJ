import { Component } from '@angular/core';
import { AIAgentModelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentModelDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'AIAgent Models') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentmodel-form',
    templateUrl: './aiagentmodel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentModelFormComponent extends BaseFormComponent {
    public record!: AIAgentModelEntity;
} 

export function LoadAIAgentModelFormComponent() {
    LoadAIAgentModelDetailsComponent();
}
