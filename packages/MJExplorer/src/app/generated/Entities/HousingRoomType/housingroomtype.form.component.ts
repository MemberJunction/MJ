import { Component } from '@angular/core';
import { HousingRoomTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadHousingRoomTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Housing Room Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-housingroomtype-form',
    templateUrl: './housingroomtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class HousingRoomTypeFormComponent extends BaseFormComponent {
    public record!: HousingRoomTypeEntity;
} 

export function LoadHousingRoomTypeFormComponent() {
    LoadHousingRoomTypeDetailsComponent();
}
