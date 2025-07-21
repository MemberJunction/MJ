import { Component } from '@angular/core';
import { QueryParameterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQueryParameterDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Query Parameters') // Tell MemberJunction about this class
@Component({
    selector: 'gen-queryparameter-form',
    templateUrl: './queryparameter.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueryParameterFormComponent extends BaseFormComponent {
    public record!: QueryParameterEntity;
} 

export function LoadQueryParameterFormComponent() {
    LoadQueryParameterDetailsComponent();
}
