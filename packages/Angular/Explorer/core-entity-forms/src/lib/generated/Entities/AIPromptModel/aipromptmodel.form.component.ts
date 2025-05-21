import { Component } from '@angular/core';
import { AIPromptModelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIPromptModelDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Models') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aipromptmodel-form',
    templateUrl: './aipromptmodel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIPromptModelFormComponent extends BaseFormComponent {
    public record!: AIPromptModelEntity;
} 

export function LoadAIPromptModelFormComponent() {
    LoadAIPromptModelDetailsComponent();
}
