import { Component } from '@angular/core';
import { TemplateCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTemplateCategoryDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Template Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-templatecategory-form',
    templateUrl: './templatecategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TemplateCategoryFormComponent extends BaseFormComponent {
    public record!: TemplateCategoryEntity;
} 

export function LoadTemplateCategoryFormComponent() {
    LoadTemplateCategoryDetailsComponent();
}
