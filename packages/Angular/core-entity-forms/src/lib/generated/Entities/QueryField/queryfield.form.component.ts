import { Component } from '@angular/core';
import { QueryFieldEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadQueryFieldDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Query Fields') // Tell MemberJunction about this class
@Component({
    selector: 'gen-queryfield-form',
    templateUrl: './queryfield.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueryFieldFormComponent extends BaseFormComponent {
    public record!: QueryFieldEntity;
} 

export function LoadQueryFieldFormComponent() {
    LoadQueryFieldDetailsComponent();
}
