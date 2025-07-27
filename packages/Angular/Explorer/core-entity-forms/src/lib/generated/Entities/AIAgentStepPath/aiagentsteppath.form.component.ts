import { Component } from '@angular/core';
import { AIAgentStepPathEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentStepPathDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Step Paths') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentsteppath-form',
    templateUrl: './aiagentsteppath.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentStepPathFormComponent extends BaseFormComponent {
    public record!: AIAgentStepPathEntity;
} 

export function LoadAIAgentStepPathFormComponent() {
    LoadAIAgentStepPathDetailsComponent();
}
