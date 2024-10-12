import { Component } from '@angular/core';
import { ResourcePermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadResourcePermissionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Resource Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resourcepermission-form',
    templateUrl: './resourcepermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ResourcePermissionFormComponent extends BaseFormComponent {
    public record!: ResourcePermissionEntity;
} 

export function LoadResourcePermissionFormComponent() {
    LoadResourcePermissionDetailsComponent();
}
