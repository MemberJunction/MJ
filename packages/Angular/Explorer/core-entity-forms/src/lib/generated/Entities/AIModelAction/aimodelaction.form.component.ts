import { Component } from '@angular/core';
import { AIModelActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIModelActionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'AI Model Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aimodelaction-form',
    templateUrl: './aimodelaction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIModelActionFormComponent extends BaseFormComponent {
    public record!: AIModelActionEntity;
} 

export function LoadAIModelActionFormComponent() {
    LoadAIModelActionDetailsComponent();
}
