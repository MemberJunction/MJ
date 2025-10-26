import { Component } from '@angular/core';
import { AIAgentExampleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentExampleDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Examples') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentexample-form',
    templateUrl: './aiagentexample.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentExampleFormComponent extends BaseFormComponent {
    public record!: AIAgentExampleEntity;
} 

export function LoadAIAgentExampleFormComponent() {
    LoadAIAgentExampleDetailsComponent();
}
