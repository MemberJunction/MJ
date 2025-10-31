import { Component } from '@angular/core';
import { AdvertisingUnitDefinitionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingUnitDefinitionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Advertising Unit Definitions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisingunitdefinition-form',
    templateUrl: './advertisingunitdefinition.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingUnitDefinitionFormComponent extends BaseFormComponent {
    public record!: AdvertisingUnitDefinitionEntity;
} 

export function LoadAdvertisingUnitDefinitionFormComponent() {
    LoadAdvertisingUnitDefinitionDetailsComponent();
}
