import { Component } from '@angular/core';
import { KeyPerformanceIndicatorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKeyPerformanceIndicatorDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Key Performance Indicators') // Tell MemberJunction about this class
@Component({
    selector: 'gen-keyperformanceindicator-form',
    templateUrl: './keyperformanceindicator.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KeyPerformanceIndicatorFormComponent extends BaseFormComponent {
    public record!: KeyPerformanceIndicatorEntity;
} 

export function LoadKeyPerformanceIndicatorFormComponent() {
    LoadKeyPerformanceIndicatorDetailsComponent();
}
