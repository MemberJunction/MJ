import { Component } from '@angular/core';
import { ResourceLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadResourceLinkDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Resource Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resourcelink-form',
    templateUrl: './resourcelink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ResourceLinkFormComponent extends BaseFormComponent {
    public record!: ResourceLinkEntity;
} 

export function LoadResourceLinkFormComponent() {
    LoadResourceLinkDetailsComponent();
}
