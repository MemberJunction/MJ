import { Component } from '@angular/core';
import { IndustryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadIndustryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Industries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-industry-form',
    templateUrl: './industry.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class IndustryFormComponent extends BaseFormComponent {
    public record!: IndustryEntity;
} 

export function LoadIndustryFormComponent() {
    LoadIndustryDetailsComponent();
}
