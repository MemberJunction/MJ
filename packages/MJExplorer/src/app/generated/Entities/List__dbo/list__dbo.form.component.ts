import { Component } from '@angular/core';
import { List__dboEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadList__dboDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Lists__dbo') // Tell MemberJunction about this class
@Component({
    selector: 'gen-list__dbo-form',
    templateUrl: './list__dbo.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class List__dboFormComponent extends BaseFormComponent {
    public record!: List__dboEntity;
} 

export function LoadList__dboFormComponent() {
    LoadList__dboDetailsComponent();
}
