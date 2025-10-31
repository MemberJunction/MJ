import { Component } from '@angular/core';
import { StandingOrderEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadStandingOrderDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Standing Orders') // Tell MemberJunction about this class
@Component({
    selector: 'gen-standingorder-form',
    templateUrl: './standingorder.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class StandingOrderFormComponent extends BaseFormComponent {
    public record!: StandingOrderEntity;
} 

export function LoadStandingOrderFormComponent() {
    LoadStandingOrderDetailsComponent();
}
