import { Component } from '@angular/core';
import { HousingTransferTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadHousingTransferTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Housing Transfer Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-housingtransfertype-form',
    templateUrl: './housingtransfertype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class HousingTransferTypeFormComponent extends BaseFormComponent {
    public record!: HousingTransferTypeEntity;
} 

export function LoadHousingTransferTypeFormComponent() {
    LoadHousingTransferTypeDetailsComponent();
}
