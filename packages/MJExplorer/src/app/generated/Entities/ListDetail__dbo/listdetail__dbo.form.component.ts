import { Component } from '@angular/core';
import { ListDetail__dboEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadListDetail__dboDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'List Details__dbo') // Tell MemberJunction about this class
@Component({
    selector: 'gen-listdetail__dbo-form',
    templateUrl: './listdetail__dbo.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ListDetail__dboFormComponent extends BaseFormComponent {
    public record!: ListDetail__dboEntity;
} 

export function LoadListDetail__dboFormComponent() {
    LoadListDetail__dboDetailsComponent();
}
