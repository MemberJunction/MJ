import { Component } from '@angular/core';
import { CultureFormatEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCultureFormatDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Culture Formats') // Tell MemberJunction about this class
@Component({
    selector: 'gen-cultureformat-form',
    templateUrl: './cultureformat.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CultureFormatFormComponent extends BaseFormComponent {
    public record!: CultureFormatEntity;
} 

export function LoadCultureFormatFormComponent() {
    LoadCultureFormatDetailsComponent();
}
