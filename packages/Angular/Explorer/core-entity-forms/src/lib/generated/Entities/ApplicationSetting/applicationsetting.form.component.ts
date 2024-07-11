import { Component } from '@angular/core';
import { ApplicationSettingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadApplicationSettingDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Application Settings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-applicationsetting-form',
    templateUrl: './applicationsetting.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ApplicationSettingFormComponent extends BaseFormComponent {
    public record!: ApplicationSettingEntity;
} 

export function LoadApplicationSettingFormComponent() {
    LoadApplicationSettingDetailsComponent();
}
