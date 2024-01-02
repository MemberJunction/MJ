import { Component } from '@angular/core';
import { AIModelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadAIModelDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'AI Models') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aimodel-form',
    templateUrl: './aimodel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIModelFormComponent extends BaseFormComponent {
    public record: AIModelEntity | null = null;
} 

export function LoadAIModelFormComponent() {
    LoadAIModelDetailsComponent();
}
