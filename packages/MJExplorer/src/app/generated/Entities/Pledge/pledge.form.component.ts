import { Component } from '@angular/core';
import { PledgeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPledgeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Pledges') // Tell MemberJunction about this class
@Component({
    selector: 'gen-pledge-form',
    templateUrl: './pledge.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PledgeFormComponent extends BaseFormComponent {
    public record!: PledgeEntity;
} 

export function LoadPledgeFormComponent() {
    LoadPledgeDetailsComponent();
}
