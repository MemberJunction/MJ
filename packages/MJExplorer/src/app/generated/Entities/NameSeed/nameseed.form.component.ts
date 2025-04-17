import { Component } from '@angular/core';
import { NameSeedEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadNameSeedDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Name Seeds') // Tell MemberJunction about this class
@Component({
    selector: 'gen-nameseed-form',
    templateUrl: './nameseed.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class NameSeedFormComponent extends BaseFormComponent {
    public record!: NameSeedEntity;
} 

export function LoadNameSeedFormComponent() {
    LoadNameSeedDetailsComponent();
}
