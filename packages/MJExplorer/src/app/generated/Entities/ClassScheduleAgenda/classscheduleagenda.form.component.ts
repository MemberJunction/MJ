import { Component } from '@angular/core';
import { ClassScheduleAgendaEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadClassScheduleAgendaDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Class Schedule Agendas') // Tell MemberJunction about this class
@Component({
    selector: 'gen-classscheduleagenda-form',
    templateUrl: './classscheduleagenda.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ClassScheduleAgendaFormComponent extends BaseFormComponent {
    public record!: ClassScheduleAgendaEntity;
} 

export function LoadClassScheduleAgendaFormComponent() {
    LoadClassScheduleAgendaDetailsComponent();
}
