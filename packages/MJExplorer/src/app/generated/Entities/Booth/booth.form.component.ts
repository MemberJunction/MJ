import { Component } from '@angular/core';
import { BoothEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadBoothDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Booths') // Tell MemberJunction about this class
@Component({
    selector: 'gen-booth-form',
    templateUrl: './booth.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class BoothFormComponent extends BaseFormComponent {
    public record!: BoothEntity;
} 

export function LoadBoothFormComponent() {
    LoadBoothDetailsComponent();
}
