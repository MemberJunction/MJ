import { Component } from '@angular/core';
import { StandingOrProdCatEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadStandingOrProdCatDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Standing Or Prod Cats') // Tell MemberJunction about this class
@Component({
    selector: 'gen-standingorprodcat-form',
    templateUrl: './standingorprodcat.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class StandingOrProdCatFormComponent extends BaseFormComponent {
    public record!: StandingOrProdCatEntity;
} 

export function LoadStandingOrProdCatFormComponent() {
    LoadStandingOrProdCatDetailsComponent();
}
