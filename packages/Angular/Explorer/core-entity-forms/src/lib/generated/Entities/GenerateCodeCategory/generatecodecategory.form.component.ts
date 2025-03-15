import { Component } from '@angular/core';
import { GenerateCodeCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGenerateCodeCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Generate Code Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-generatecodecategory-form',
    templateUrl: './generatecodecategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GenerateCodeCategoryFormComponent extends BaseFormComponent {
    public record!: GenerateCodeCategoryEntity;
} 

export function LoadGenerateCodeCategoryFormComponent() {
    LoadGenerateCodeCategoryDetailsComponent();
}
