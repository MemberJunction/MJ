import { Component } from '@angular/core';
import { PrefCommunicationMethodEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPrefCommunicationMethodDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Pref Communication Methods') // Tell MemberJunction about this class
@Component({
    selector: 'gen-prefcommunicationmethod-form',
    templateUrl: './prefcommunicationmethod.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PrefCommunicationMethodFormComponent extends BaseFormComponent {
    public record!: PrefCommunicationMethodEntity;
} 

export function LoadPrefCommunicationMethodFormComponent() {
    LoadPrefCommunicationMethodDetailsComponent();
}
