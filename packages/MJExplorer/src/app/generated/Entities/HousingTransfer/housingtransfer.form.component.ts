import { Component } from '@angular/core';
import { HousingTransferEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadHousingTransferDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Housing Transfers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-housingtransfer-form',
    templateUrl: './housingtransfer.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class HousingTransferFormComponent extends BaseFormComponent {
    public record!: HousingTransferEntity;
} 

export function LoadHousingTransferFormComponent() {
    LoadHousingTransferDetailsComponent();
}
