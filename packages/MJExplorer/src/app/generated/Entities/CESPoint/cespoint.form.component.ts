import { Component } from '@angular/core';
import { CESPointEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCESPointDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'CES Points') // Tell MemberJunction about this class
@Component({
    selector: 'gen-cespoint-form',
    templateUrl: './cespoint.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CESPointFormComponent extends BaseFormComponent {
    public record!: CESPointEntity;
} 

export function LoadCESPointFormComponent() {
    LoadCESPointDetailsComponent();
}
