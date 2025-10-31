import { Component } from '@angular/core';
import { ExpoBoothConfigurationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadExpoBoothConfigurationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Expo Booth Configurations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-expoboothconfiguration-form',
    templateUrl: './expoboothconfiguration.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ExpoBoothConfigurationFormComponent extends BaseFormComponent {
    public record!: ExpoBoothConfigurationEntity;
} 

export function LoadExpoBoothConfigurationFormComponent() {
    LoadExpoBoothConfigurationDetailsComponent();
}
