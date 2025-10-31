import { Component } from '@angular/core';
import { CultureStringEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCultureStringDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Culture Strings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-culturestring-form',
    templateUrl: './culturestring.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CultureStringFormComponent extends BaseFormComponent {
    public record!: CultureStringEntity;
} 

export function LoadCultureStringFormComponent() {
    LoadCultureStringDetailsComponent();
}
