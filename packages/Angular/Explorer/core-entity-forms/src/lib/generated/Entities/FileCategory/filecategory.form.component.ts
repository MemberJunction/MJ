import { Component } from '@angular/core';
import { FileCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFileCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'File Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-filecategory-form',
    templateUrl: './filecategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FileCategoryFormComponent extends BaseFormComponent {
    public record!: FileCategoryEntity;
} 

export function LoadFileCategoryFormComponent() {
    LoadFileCategoryDetailsComponent();
}
