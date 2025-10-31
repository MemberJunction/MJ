import { Component } from '@angular/core';
import { AIAgentDataSourceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentDataSourceDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Data Sources') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentdatasource-form',
    templateUrl: './aiagentdatasource.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentDataSourceFormComponent extends BaseFormComponent {
    public record!: AIAgentDataSourceEntity;
} 

export function LoadAIAgentDataSourceFormComponent() {
    LoadAIAgentDataSourceDetailsComponent();
}
