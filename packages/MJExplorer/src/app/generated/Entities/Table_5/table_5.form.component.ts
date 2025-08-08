import { Component } from '@angular/core';
import { Table_5Entity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTable_5TopComponent } from "./sections/top.component"
import { LoadTable_5DetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Enrolments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-table_5-form',
    templateUrl: './table_5.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Table_5FormComponent extends BaseFormComponent {
    public record!: Table_5Entity;
} 

export function LoadTable_5FormComponent() {
    LoadTable_5TopComponent();
    LoadTable_5DetailsComponent();
}
