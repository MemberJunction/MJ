import { Component } from '@angular/core';
import { AIModelTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadAIModelTypeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'AI Model Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aimodeltype-form',
    templateUrl: './aimodeltype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIModelTypeFormComponent extends BaseFormComponent {
    public record: AIModelTypeEntity | null = null;
} 

export function LoadAIModelTypeFormComponent() {
    LoadAIModelTypeDetailsComponent();
}
