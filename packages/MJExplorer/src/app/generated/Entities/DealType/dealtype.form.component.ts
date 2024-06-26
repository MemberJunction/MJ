import { Component } from '@angular/core';
import { DealTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDealTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Deal Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dealtype-form',
    templateUrl: './dealtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DealTypeFormComponent extends BaseFormComponent {
    public record!: DealTypeEntity;
} 

export function LoadDealTypeFormComponent() {
    LoadDealTypeDetailsComponent();
}
