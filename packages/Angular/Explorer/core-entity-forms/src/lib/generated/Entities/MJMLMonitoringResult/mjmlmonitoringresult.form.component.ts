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
            { sectionKey: 'modelConfiguration', sectionName: 'Model Configuration', isExpanded: true },
            { sectionKey: 'monitoringPeriod', sectionName: 'Monitoring Period', isExpanded: true },
            { sectionKey: 'evaluationMetrics', sectionName: 'Evaluation Metrics', isExpanded: true },
            { sectionKey: 'driftAndParityChecks', sectionName: 'Drift and Parity Checks', isExpanded: true },
            { sectionKey: 'triggersAndAutomation', sectionName: 'Triggers and Automation', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

