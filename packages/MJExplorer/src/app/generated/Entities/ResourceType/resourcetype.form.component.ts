import { Component } from '@angular/core';
import { ResourceTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadResourceTypeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Resource Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resourcetype-form',
    templateUrl: './resourcetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ResourceTypeFormComponent extends BaseFormComponent {
    public record: ResourceTypeEntity | null = null;
} 

export function LoadResourceTypeFormComponent() {
    LoadResourceTypeDetailsComponent();
}
