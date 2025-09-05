import { Component } from '@angular/core';
import { ComponentLibraryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadComponentLibraryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Component Libraries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-componentlibrary-form',
    templateUrl: './componentlibrary.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ComponentLibraryFormComponent extends BaseFormComponent {
    public record!: ComponentLibraryEntity;
} 

export function LoadComponentLibraryFormComponent() {
    LoadComponentLibraryDetailsComponent();
}
