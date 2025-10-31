import { Component } from '@angular/core';
import { StandingOrderScheduleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadStandingOrderScheduleDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Standing Order Schedules') // Tell MemberJunction about this class
@Component({
    selector: 'gen-standingorderschedule-form',
    templateUrl: './standingorderschedule.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class StandingOrderScheduleFormComponent extends BaseFormComponent {
    public record!: StandingOrderScheduleEntity;
} 

export function LoadStandingOrderScheduleFormComponent() {
    LoadStandingOrderScheduleDetailsComponent();
}
