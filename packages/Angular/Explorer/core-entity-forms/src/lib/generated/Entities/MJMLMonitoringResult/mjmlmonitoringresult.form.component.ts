import { Component } from '@angular/core';
import { MJMLMonitoringResultEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Monitoring Results') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlmonitoringresult-form',
    templateUrl: './mjmlmonitoringresult.form.component.html'
})
export class MJMLMonitoringResultFormComponent extends BaseFormComponent {
    public record!: MJMLMonitoringResultEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'monitoringPeriodStatus', sectionName: 'Monitoring Period & Status', isExpanded: true },
            { sectionKey: 'metricsOutcomes', sectionName: 'Metrics & Outcomes', isExpanded: true },
            { sectionKey: 'driftParity', sectionName: 'Drift & Parity', isExpanded: true },
            { sectionKey: 'triggersActions', sectionName: 'Triggers & Actions', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

