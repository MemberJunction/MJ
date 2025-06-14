import { Component } from '@angular/core';
import { AIModelPriceTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIModelPriceTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: AI Model Price Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aimodelpricetype-form',
    templateUrl: './aimodelpricetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIModelPriceTypeFormComponent extends BaseFormComponent {
    public record!: AIModelPriceTypeEntity;
} 

export function LoadAIModelPriceTypeFormComponent() {
    LoadAIModelPriceTypeDetailsComponent();
}
