import { Component } from '@angular/core';
import { HousingTransferDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadHousingTransferDetailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Housing Transfer Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-housingtransferdetail-form',
    templateUrl: './housingtransferdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class HousingTransferDetailFormComponent extends BaseFormComponent {
    public record!: HousingTransferDetailEntity;
} 

export function LoadHousingTransferDetailFormComponent() {
    LoadHousingTransferDetailDetailsComponent();
}
