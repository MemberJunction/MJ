import { Component } from '@angular/core';
import { LibraryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadLibraryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Libraries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-library-form',
    templateUrl: './library.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class LibraryFormComponent extends BaseFormComponent {
    public record!: LibraryEntity;
} 

export function LoadLibraryFormComponent() {
    LoadLibraryDetailsComponent();
}
