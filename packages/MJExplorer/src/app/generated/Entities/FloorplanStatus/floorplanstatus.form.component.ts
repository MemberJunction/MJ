import { Component } from '@angular/core';
import { FloorplanStatusEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFloorplanStatusDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Floorplan Status') // Tell MemberJunction about this class
@Component({
    selector: 'gen-floorplanstatus-form',
    templateUrl: './floorplanstatus.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FloorplanStatusFormComponent extends BaseFormComponent {
    public record!: FloorplanStatusEntity;
} 

export function LoadFloorplanStatusFormComponent() {
    LoadFloorplanStatusDetailsComponent();
}
