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
            { sectionKey: 'monitoringContext', sectionName: 'Monitoring Context', isExpanded: true },
            { sectionKey: 'evaluationMetrics', sectionName: 'Evaluation & Metrics', isExpanded: true },
            { sectionKey: 'driftParityAnalysis', sectionName: 'Drift & Parity Analysis', isExpanded: true },
            { sectionKey: 'triggersAutomatedChecks', sectionName: 'Triggers & Automated Checks', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

