import { Component } from '@angular/core';
import { QueryEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQueryEntityDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Query Entities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-queryentity-form',
    templateUrl: './queryentity.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueryEntityFormComponent extends BaseFormComponent {
    public record!: QueryEntityEntity;
} 

export function LoadQueryEntityFormComponent() {
    LoadQueryEntityDetailsComponent();
}
