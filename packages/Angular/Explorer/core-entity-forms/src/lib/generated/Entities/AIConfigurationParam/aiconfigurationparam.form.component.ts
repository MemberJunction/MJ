import { Component } from '@angular/core';
import { AIConfigurationParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIConfigurationParamDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: AI Configuration Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiconfigurationparam-form',
    templateUrl: './aiconfigurationparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIConfigurationParamFormComponent extends BaseFormComponent {
    public record!: AIConfigurationParamEntity;
} 

export function LoadAIConfigurationParamFormComponent() {
    LoadAIConfigurationParamDetailsComponent();
}
