import { Component } from '@angular/core';
import { ExpoEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadExpoDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Expos') // Tell MemberJunction about this class
@Component({
    selector: 'gen-expo-form',
    templateUrl: './expo.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ExpoFormComponent extends BaseFormComponent {
    public record!: ExpoEntity;
} 

export function LoadExpoFormComponent() {
    LoadExpoDetailsComponent();
}
