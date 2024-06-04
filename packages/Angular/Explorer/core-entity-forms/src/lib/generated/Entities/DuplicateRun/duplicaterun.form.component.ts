import { Component } from '@angular/core';
import { DuplicateRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDuplicateRunDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Duplicate Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-duplicaterun-form',
    templateUrl: './duplicaterun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DuplicateRunFormComponent extends BaseFormComponent {
    public record!: DuplicateRunEntity;
} 

export function LoadDuplicateRunFormComponent() {
    LoadDuplicateRunDetailsComponent();
}
