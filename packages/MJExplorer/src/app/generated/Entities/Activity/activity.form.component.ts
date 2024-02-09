import { Component } from '@angular/core';
import { ActivityEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadActivityDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Activities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-activity-form',
    templateUrl: './activity.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActivityFormComponent extends BaseFormComponent {
    public record!: ActivityEntity;
} 

export function LoadActivityFormComponent() {
    LoadActivityDetailsComponent();
}
