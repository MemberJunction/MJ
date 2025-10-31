import { Component } from '@angular/core';
import { ExpoPriorityPointEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadExpoPriorityPointDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Expo Priority Points') // Tell MemberJunction about this class
@Component({
    selector: 'gen-expoprioritypoint-form',
    templateUrl: './expoprioritypoint.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ExpoPriorityPointFormComponent extends BaseFormComponent {
    public record!: ExpoPriorityPointEntity;
} 

export function LoadExpoPriorityPointFormComponent() {
    LoadExpoPriorityPointDetailsComponent();
}
