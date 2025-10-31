import { Component } from '@angular/core';
import { PostalCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPostalCodeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Postal Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-postalcode-form',
    templateUrl: './postalcode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PostalCodeFormComponent extends BaseFormComponent {
    public record!: PostalCodeEntity;
} 

export function LoadPostalCodeFormComponent() {
    LoadPostalCodeDetailsComponent();
}
