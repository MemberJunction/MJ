import { Component } from '@angular/core';
import { ListEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadListDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Lists') // Tell MemberJunction about this class
@Component({
    selector: 'gen-list-form',
    templateUrl: './list.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ListFormComponent extends BaseFormComponent {
    public record!: ListEntity;
} 

export function LoadListFormComponent() {
    LoadListDetailsComponent();
}
