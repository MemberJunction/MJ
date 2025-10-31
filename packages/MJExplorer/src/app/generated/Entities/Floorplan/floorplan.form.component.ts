import { Component } from '@angular/core';
import { FloorplanEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFloorplanDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Floorplans') // Tell MemberJunction about this class
@Component({
    selector: 'gen-floorplan-form',
    templateUrl: './floorplan.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FloorplanFormComponent extends BaseFormComponent {
    public record!: FloorplanEntity;
} 

export function LoadFloorplanFormComponent() {
    LoadFloorplanDetailsComponent();
}
