import { Component } from '@angular/core';
import { MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Training Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmltrainingrun-form',
    templateUrl: './mjmltrainingrun.form.component.html'
})
export class MJMLTrainingRunFormComponent extends BaseFormComponent {
    public record!: MJMLTrainingRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'trainingConfiguration', sectionName: 'Training Configuration', isExpanded: true },
            { sectionKey: 'executionStatus', sectionName: 'Execution & Status', isExpanded: true },
            { sectionKey: 'metricsResourceUsage', sectionName: 'Metrics & Resource Usage', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

