import { Component } from '@angular/core';
import { ShipTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadShipTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Ship Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-shiptype-form',
    templateUrl: './shiptype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ShipTypeFormComponent extends BaseFormComponent {
    public record!: ShipTypeEntity;
} 

export function LoadShipTypeFormComponent() {
    LoadShipTypeDetailsComponent();
}
