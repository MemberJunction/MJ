import { Component } from '@angular/core';
import { AIAgentStepEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentStepDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Steps') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentstep-form',
    templateUrl: './aiagentstep.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentStepFormComponent extends BaseFormComponent {
    public record!: AIAgentStepEntity;
} 

export function LoadAIAgentStepFormComponent() {
    LoadAIAgentStepDetailsComponent();
}
