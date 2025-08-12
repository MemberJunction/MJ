import { Component } from '@angular/core';
import { ComponentDependencyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadComponentDependencyDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Component Dependencies') // Tell MemberJunction about this class
@Component({
    selector: 'gen-componentdependency-form',
    templateUrl: './componentdependency.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ComponentDependencyFormComponent extends BaseFormComponent {
    public record!: ComponentDependencyEntity;
} 

export function LoadComponentDependencyFormComponent() {
    LoadComponentDependencyDetailsComponent();
}
