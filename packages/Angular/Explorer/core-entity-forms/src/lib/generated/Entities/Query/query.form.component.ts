import { Component } from '@angular/core';
import { QueryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQueryDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Queries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-query-form',
    templateUrl: './query.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueryFormComponent extends BaseFormComponent {
    public record!: QueryEntity;
} 

export function LoadQueryFormComponent() {
    LoadQueryDetailsComponent();
}
