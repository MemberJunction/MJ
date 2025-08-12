import { Component } from '@angular/core';
import { ComponentLibraryLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadComponentLibraryLinkDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Component Library Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-componentlibrarylink-form',
    templateUrl: './componentlibrarylink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ComponentLibraryLinkFormComponent extends BaseFormComponent {
    public record!: ComponentLibraryLinkEntity;
} 

export function LoadComponentLibraryLinkFormComponent() {
    LoadComponentLibraryLinkDetailsComponent();
}
