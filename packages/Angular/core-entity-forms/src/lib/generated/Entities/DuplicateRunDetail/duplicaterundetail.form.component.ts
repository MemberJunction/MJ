import { Component } from '@angular/core';
import { DuplicateRunDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDuplicateRunDetailDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Duplicate Run Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-duplicaterundetail-form',
    templateUrl: './duplicaterundetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DuplicateRunDetailFormComponent extends BaseFormComponent {
    public record!: DuplicateRunDetailEntity;
} 

export function LoadDuplicateRunDetailFormComponent() {
    LoadDuplicateRunDetailDetailsComponent();
}
