import { Component } from '@angular/core';
import { KPIResultParticipantRecordEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKPIResultParticipantRecordDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'KPI Result Participant Records') // Tell MemberJunction about this class
@Component({
    selector: 'gen-kpiresultparticipantrecord-form',
    templateUrl: './kpiresultparticipantrecord.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KPIResultParticipantRecordFormComponent extends BaseFormComponent {
    public record!: KPIResultParticipantRecordEntity;
} 

export function LoadKPIResultParticipantRecordFormComponent() {
    LoadKPIResultParticipantRecordDetailsComponent();
}
