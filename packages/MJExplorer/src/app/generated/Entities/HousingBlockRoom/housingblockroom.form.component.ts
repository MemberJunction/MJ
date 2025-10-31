import { Component } from '@angular/core';
import { HousingBlockRoomEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadHousingBlockRoomDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Housing Block Rooms') // Tell MemberJunction about this class
@Component({
    selector: 'gen-housingblockroom-form',
    templateUrl: './housingblockroom.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class HousingBlockRoomFormComponent extends BaseFormComponent {
    public record!: HousingBlockRoomEntity;
} 

export function LoadHousingBlockRoomFormComponent() {
    LoadHousingBlockRoomDetailsComponent();
}
