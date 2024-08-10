import { Component } from '@angular/core';
import { AIPromptCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIPromptCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'AI Prompt Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aipromptcategory-form',
    templateUrl: './aipromptcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIPromptCategoryFormComponent extends BaseFormComponent {
    public record!: AIPromptCategoryEntity;
} 

export function LoadAIPromptCategoryFormComponent() {
    LoadAIPromptCategoryDetailsComponent();
}
