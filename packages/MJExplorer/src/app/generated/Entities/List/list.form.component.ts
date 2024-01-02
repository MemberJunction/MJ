import { Component } from '@angular/core';
import { ListEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadListDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Lists') // Tell MemberJunction about this class
@Component({
    selector: 'gen-list-form',
    templateUrl: './list.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ListFormComponent extends BaseFormComponent {
    public record: ListEntity | null = null;
} 

export function LoadListFormComponent() {
    LoadListDetailsComponent();
}
