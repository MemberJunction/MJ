import { Component } from '@angular/core';
import { IssueCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadIssueCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Issue Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-issuecategory-form',
    templateUrl: './issuecategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class IssueCategoryFormComponent extends BaseFormComponent {
    public record!: IssueCategoryEntity;
} 

export function LoadIssueCategoryFormComponent() {
    LoadIssueCategoryDetailsComponent();
}
