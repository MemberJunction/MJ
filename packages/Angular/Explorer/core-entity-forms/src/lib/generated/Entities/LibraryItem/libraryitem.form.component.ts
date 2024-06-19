import { Component } from '@angular/core';
import { LibraryItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadLibraryItemDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Library Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-libraryitem-form',
    templateUrl: './libraryitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class LibraryItemFormComponent extends BaseFormComponent {
    public record!: LibraryItemEntity;
} 

export function LoadLibraryItemFormComponent() {
    LoadLibraryItemDetailsComponent();
}
