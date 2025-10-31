import { Component } from '@angular/core';
import { ResourceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadResourceDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Resources') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resource-form',
    templateUrl: './resource.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ResourceFormComponent extends BaseFormComponent {
    public record!: ResourceEntity;
} 

export function LoadResourceFormComponent() {
    LoadResourceDetailsComponent();
}
