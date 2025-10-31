import { Component } from '@angular/core';
import { PrefixEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPrefixDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Prefixes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-prefix-form',
    templateUrl: './prefix.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PrefixFormComponent extends BaseFormComponent {
    public record!: PrefixEntity;
} 

export function LoadPrefixFormComponent() {
    LoadPrefixDetailsComponent();
}
