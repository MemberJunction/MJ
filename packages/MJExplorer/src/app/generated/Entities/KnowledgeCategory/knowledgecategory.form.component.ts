import { Component } from '@angular/core';
import { KnowledgeCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKnowledgeCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Knowledge Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-knowledgecategory-form',
    templateUrl: './knowledgecategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KnowledgeCategoryFormComponent extends BaseFormComponent {
    public record!: KnowledgeCategoryEntity;
} 

export function LoadKnowledgeCategoryFormComponent() {
    LoadKnowledgeCategoryDetailsComponent();
}
