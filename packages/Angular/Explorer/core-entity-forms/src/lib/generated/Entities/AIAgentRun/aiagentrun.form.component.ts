import { Component } from '@angular/core';
import { AIAgentRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentRunDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentrun-form',
    templateUrl: './aiagentrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentRunFormComponent extends BaseFormComponent {
    public record!: AIAgentRunEntity;
} 

export function LoadAIAgentRunFormComponent() {
    LoadAIAgentRunDetailsComponent();
}
