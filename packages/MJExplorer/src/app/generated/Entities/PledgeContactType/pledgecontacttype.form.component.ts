import { Component } from '@angular/core';
import { PledgeContactTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPledgeContactTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Pledge Contact Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-pledgecontacttype-form',
    templateUrl: './pledgecontacttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PledgeContactTypeFormComponent extends BaseFormComponent {
    public record!: PledgeContactTypeEntity;
} 

export function LoadPledgeContactTypeFormComponent() {
    LoadPledgeContactTypeDetailsComponent();
}
