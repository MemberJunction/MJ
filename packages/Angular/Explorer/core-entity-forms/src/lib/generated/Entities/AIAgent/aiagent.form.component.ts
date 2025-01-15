import { Component } from '@angular/core';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'AIAgents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagent-form',
    templateUrl: './aiagent.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentFormComponent extends BaseFormComponent {
    public record!: AIAgentEntity;
} 

export function LoadAIAgentFormComponent() {
    LoadAIAgentDetailsComponent();
}
