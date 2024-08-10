import { Component } from '@angular/core';
import { AIPromptTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIPromptTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'AI Prompt Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiprompttype-form',
    templateUrl: './aiprompttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIPromptTypeFormComponent extends BaseFormComponent {
    public record!: AIPromptTypeEntity;
} 

export function LoadAIPromptTypeFormComponent() {
    LoadAIPromptTypeDetailsComponent();
}
