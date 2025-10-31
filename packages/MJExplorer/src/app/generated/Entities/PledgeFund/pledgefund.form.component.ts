import { Component } from '@angular/core';
import { PledgeFundEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPledgeFundDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Pledge Funds') // Tell MemberJunction about this class
@Component({
    selector: 'gen-pledgefund-form',
    templateUrl: './pledgefund.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PledgeFundFormComponent extends BaseFormComponent {
    public record!: PledgeFundEntity;
} 

export function LoadPledgeFundFormComponent() {
    LoadPledgeFundDetailsComponent();
}
