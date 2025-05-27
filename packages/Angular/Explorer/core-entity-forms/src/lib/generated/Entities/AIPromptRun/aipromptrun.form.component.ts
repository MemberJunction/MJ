import { Component } from '@angular/core';
import { AIPromptRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIPromptRunDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aipromptrun-form',
    templateUrl: './aipromptrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIPromptRunFormComponent extends BaseFormComponent {
    public record!: AIPromptRunEntity;
} 

export function LoadAIPromptRunFormComponent() {
    LoadAIPromptRunDetailsComponent();
}
