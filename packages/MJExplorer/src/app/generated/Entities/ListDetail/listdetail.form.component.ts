import { Component } from '@angular/core';
import { ListDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadListDetailDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'List Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-listdetail-form',
    templateUrl: './listdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ListDetailFormComponent extends BaseFormComponent {
    public record: ListDetailEntity | null = null;
} 

export function LoadListDetailFormComponent() {
    LoadListDetailDetailsComponent();
}
