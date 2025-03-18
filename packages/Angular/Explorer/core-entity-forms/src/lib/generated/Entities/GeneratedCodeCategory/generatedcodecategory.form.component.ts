import { Component } from '@angular/core';
import { GeneratedCodeCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGeneratedCodeCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Generated Code Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-generatedcodecategory-form',
    templateUrl: './generatedcodecategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GeneratedCodeCategoryFormComponent extends BaseFormComponent {
    public record!: GeneratedCodeCategoryEntity;
} 

export function LoadGeneratedCodeCategoryFormComponent() {
    LoadGeneratedCodeCategoryDetailsComponent();
}
