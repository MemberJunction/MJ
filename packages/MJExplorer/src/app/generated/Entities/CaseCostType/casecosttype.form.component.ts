import { Component } from '@angular/core';
import { CaseCostTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseCostTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Case Cost Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-casecosttype-form',
    templateUrl: './casecosttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseCostTypeFormComponent extends BaseFormComponent {
    public record!: CaseCostTypeEntity;
} 

export function LoadCaseCostTypeFormComponent() {
    LoadCaseCostTypeDetailsComponent();
}
