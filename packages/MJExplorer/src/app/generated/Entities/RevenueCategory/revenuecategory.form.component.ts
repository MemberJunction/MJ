import { Component } from '@angular/core';
import { RevenueCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRevenueCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Revenue Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-revenuecategory-form',
    templateUrl: './revenuecategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RevenueCategoryFormComponent extends BaseFormComponent {
    public record!: RevenueCategoryEntity;
} 

export function LoadRevenueCategoryFormComponent() {
    LoadRevenueCategoryDetailsComponent();
}
