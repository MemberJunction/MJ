import { Component } from '@angular/core';
import { StandingOrProdEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadStandingOrProdDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Standing Or Prods') // Tell MemberJunction about this class
@Component({
    selector: 'gen-standingorprod-form',
    templateUrl: './standingorprod.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class StandingOrProdFormComponent extends BaseFormComponent {
    public record!: StandingOrProdEntity;
} 

export function LoadStandingOrProdFormComponent() {
    LoadStandingOrProdDetailsComponent();
}
