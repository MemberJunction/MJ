import { Component } from '@angular/core';
import { EntityPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadEntityPermissionDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitypermission-form',
    templateUrl: './entitypermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityPermissionFormComponent extends BaseFormComponent {
    public record!: EntityPermissionEntity;
} 

export function LoadEntityPermissionFormComponent() {
    LoadEntityPermissionDetailsComponent();
}
