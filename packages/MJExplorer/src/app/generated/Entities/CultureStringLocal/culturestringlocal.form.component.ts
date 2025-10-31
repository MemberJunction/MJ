import { Component } from '@angular/core';
import { CultureStringLocalEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCultureStringLocalDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Culture String Locals') // Tell MemberJunction about this class
@Component({
    selector: 'gen-culturestringlocal-form',
    templateUrl: './culturestringlocal.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CultureStringLocalFormComponent extends BaseFormComponent {
    public record!: CultureStringLocalEntity;
} 

export function LoadCultureStringLocalFormComponent() {
    LoadCultureStringLocalDetailsComponent();
}
