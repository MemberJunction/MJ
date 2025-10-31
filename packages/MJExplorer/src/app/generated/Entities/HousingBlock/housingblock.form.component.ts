import { Component } from '@angular/core';
import { HousingBlockEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadHousingBlockDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Housing Blocks') // Tell MemberJunction about this class
@Component({
    selector: 'gen-housingblock-form',
    templateUrl: './housingblock.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class HousingBlockFormComponent extends BaseFormComponent {
    public record!: HousingBlockEntity;
} 

export function LoadHousingBlockFormComponent() {
    LoadHousingBlockDetailsComponent();
}
