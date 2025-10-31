import { Component } from '@angular/core';
import { HousingBlockOptionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadHousingBlockOptionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Housing Block Options') // Tell MemberJunction about this class
@Component({
    selector: 'gen-housingblockoption-form',
    templateUrl: './housingblockoption.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class HousingBlockOptionFormComponent extends BaseFormComponent {
    public record!: HousingBlockOptionEntity;
} 

export function LoadHousingBlockOptionFormComponent() {
    LoadHousingBlockOptionDetailsComponent();
}
