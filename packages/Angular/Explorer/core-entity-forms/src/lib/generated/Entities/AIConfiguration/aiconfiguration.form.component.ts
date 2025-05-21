import { Component } from '@angular/core';
import { AIConfigurationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIConfigurationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: AI Configurations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiconfiguration-form',
    templateUrl: './aiconfiguration.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIConfigurationFormComponent extends BaseFormComponent {
    public record!: AIConfigurationEntity;
} 

export function LoadAIConfigurationFormComponent() {
    LoadAIConfigurationDetailsComponent();
}
