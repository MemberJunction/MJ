import { Component } from '@angular/core';
import { QueryPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQueryPermissionDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Query Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-querypermission-form',
    templateUrl: './querypermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueryPermissionFormComponent extends BaseFormComponent {
    public record!: QueryPermissionEntity;
} 

export function LoadQueryPermissionFormComponent() {
    LoadQueryPermissionDetailsComponent();
}
