import { Component } from '@angular/core';
import { FloorplanSystemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFloorplanSystemDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Floorplan Systems') // Tell MemberJunction about this class
@Component({
    selector: 'gen-floorplansystem-form',
    templateUrl: './floorplansystem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FloorplanSystemFormComponent extends BaseFormComponent {
    public record!: FloorplanSystemEntity;
} 

export function LoadFloorplanSystemFormComponent() {
    LoadFloorplanSystemDetailsComponent();
}
