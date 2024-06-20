import { Component } from '@angular/core';
import { QueryCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQueryCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Query Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-querycategory-form',
    templateUrl: './querycategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueryCategoryFormComponent extends BaseFormComponent {
    public record!: QueryCategoryEntity;
} 

export function LoadQueryCategoryFormComponent() {
    LoadQueryCategoryDetailsComponent();
}
