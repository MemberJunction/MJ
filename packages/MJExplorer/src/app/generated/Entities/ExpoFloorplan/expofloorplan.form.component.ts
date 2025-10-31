import { Component } from '@angular/core';
import { ExpoFloorplanEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadExpoFloorplanDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Expo Floorplans') // Tell MemberJunction about this class
@Component({
    selector: 'gen-expofloorplan-form',
    templateUrl: './expofloorplan.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ExpoFloorplanFormComponent extends BaseFormComponent {
    public record!: ExpoFloorplanEntity;
} 

export function LoadExpoFloorplanFormComponent() {
    LoadExpoFloorplanDetailsComponent();
}
