import { Component } from '@angular/core';
import { CaseCostEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseCostDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Case Costs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-casecost-form',
    templateUrl: './casecost.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseCostFormComponent extends BaseFormComponent {
    public record!: CaseCostEntity;
} 

export function LoadCaseCostFormComponent() {
    LoadCaseCostDetailsComponent();
}
