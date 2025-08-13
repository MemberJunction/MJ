import { Component } from '@angular/core';
import { ComponentRegistryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadComponentRegistryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Component Registries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-componentregistry-form',
    templateUrl: './componentregistry.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ComponentRegistryFormComponent extends BaseFormComponent {
    public record!: ComponentRegistryEntity;
} 

export function LoadComponentRegistryFormComponent() {
    LoadComponentRegistryDetailsComponent();
}
