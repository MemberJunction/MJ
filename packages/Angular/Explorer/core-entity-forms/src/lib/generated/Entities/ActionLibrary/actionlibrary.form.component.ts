import { Component } from '@angular/core';
import { ActionLibraryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActionLibraryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Action Libraries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionlibrary-form',
    templateUrl: './actionlibrary.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionLibraryFormComponent extends BaseFormComponent {
    public record!: ActionLibraryEntity;
} 

export function LoadActionLibraryFormComponent() {
    LoadActionLibraryDetailsComponent();
}
