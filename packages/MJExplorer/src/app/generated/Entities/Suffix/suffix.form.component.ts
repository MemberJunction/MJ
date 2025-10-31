import { Component } from '@angular/core';
import { SuffixEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSuffixDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Suffixes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-suffix-form',
    templateUrl: './suffix.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SuffixFormComponent extends BaseFormComponent {
    public record!: SuffixEntity;
} 

export function LoadSuffixFormComponent() {
    LoadSuffixDetailsComponent();
}
