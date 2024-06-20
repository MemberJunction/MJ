import { Component } from '@angular/core';
import { DuplicateRunDetailMatchEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDuplicateRunDetailMatchDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Duplicate Run Detail Matches') // Tell MemberJunction about this class
@Component({
    selector: 'gen-duplicaterundetailmatch-form',
    templateUrl: './duplicaterundetailmatch.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DuplicateRunDetailMatchFormComponent extends BaseFormComponent {
    public record!: DuplicateRunDetailMatchEntity;
} 

export function LoadDuplicateRunDetailMatchFormComponent() {
    LoadDuplicateRunDetailMatchDetailsComponent();
}
