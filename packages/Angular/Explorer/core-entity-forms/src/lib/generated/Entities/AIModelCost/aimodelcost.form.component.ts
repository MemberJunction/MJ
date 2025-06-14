import { Component } from '@angular/core';
import { AIModelCostEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIModelCostDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: AI Model Costs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aimodelcost-form',
    templateUrl: './aimodelcost.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIModelCostFormComponent extends BaseFormComponent {
    public record!: AIModelCostEntity;
} 

export function LoadAIModelCostFormComponent() {
    LoadAIModelCostDetailsComponent();
}
