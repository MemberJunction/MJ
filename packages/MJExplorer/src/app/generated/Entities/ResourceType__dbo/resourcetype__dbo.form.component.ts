import { Component } from '@angular/core';
import { ResourceType__dboEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadResourceType__dboDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Resource Types__dbo') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resourcetype__dbo-form',
    templateUrl: './resourcetype__dbo.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ResourceType__dboFormComponent extends BaseFormComponent {
    public record!: ResourceType__dboEntity;
} 

export function LoadResourceType__dboFormComponent() {
    LoadResourceType__dboDetailsComponent();
}
