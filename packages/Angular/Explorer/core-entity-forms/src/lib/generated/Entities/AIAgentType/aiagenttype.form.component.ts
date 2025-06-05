import { Component } from '@angular/core';
import { AIAgentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagenttype-form',
    templateUrl: './aiagenttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentTypeFormComponent extends BaseFormComponent {
    public record!: AIAgentTypeEntity;
} 

export function LoadAIAgentTypeFormComponent() {
    LoadAIAgentTypeDetailsComponent();
}
