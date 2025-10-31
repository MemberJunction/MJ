import { Component } from '@angular/core';
import { ExpoPriorityPointTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadExpoPriorityPointTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Expo Priority Point Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-expoprioritypointtype-form',
    templateUrl: './expoprioritypointtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ExpoPriorityPointTypeFormComponent extends BaseFormComponent {
    public record!: ExpoPriorityPointTypeEntity;
} 

export function LoadExpoPriorityPointTypeFormComponent() {
    LoadExpoPriorityPointTypeDetailsComponent();
}
