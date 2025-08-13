import { Component } from '@angular/core';
import { ComponentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadComponentDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Components') // Tell MemberJunction about this class
@Component({
    selector: 'gen-component-form',
    templateUrl: './component.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ComponentFormComponent extends BaseFormComponent {
    public record!: ComponentEntity;
} 

export function LoadComponentFormComponent() {
    LoadComponentDetailsComponent();
}
