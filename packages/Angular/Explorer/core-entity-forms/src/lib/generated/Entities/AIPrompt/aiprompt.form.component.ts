import { Component } from '@angular/core';
import { AIPromptEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIPromptDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'AI Prompts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiprompt-form',
    templateUrl: './aiprompt.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIPromptFormComponent extends BaseFormComponent {
    public record!: AIPromptEntity;
} 

export function LoadAIPromptFormComponent() {
    LoadAIPromptDetailsComponent();
}
