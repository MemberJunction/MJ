import { Component } from '@angular/core';
import { AIActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIActionDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'AI Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiaction-form',
    templateUrl: './aiaction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIActionFormComponent extends BaseFormComponent {
    public record!: AIActionEntity;
} 

export function LoadAIActionFormComponent() {
    LoadAIActionDetailsComponent();
}
