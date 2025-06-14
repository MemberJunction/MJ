import { Component } from '@angular/core';
import { AIModelPriceUnitTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIModelPriceUnitTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: AI Model Price Unit Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aimodelpriceunittype-form',
    templateUrl: './aimodelpriceunittype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIModelPriceUnitTypeFormComponent extends BaseFormComponent {
    public record!: AIModelPriceUnitTypeEntity;
} 

export function LoadAIModelPriceUnitTypeFormComponent() {
    LoadAIModelPriceUnitTypeDetailsComponent();
}
