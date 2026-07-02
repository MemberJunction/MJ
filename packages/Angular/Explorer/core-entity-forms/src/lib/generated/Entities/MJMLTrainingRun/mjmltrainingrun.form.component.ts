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
            { sectionKey: 'executionContext', sectionName: 'Execution Context', isExpanded: true },
            { sectionKey: 'performanceMetrics', sectionName: 'Performance Metrics', isExpanded: true },
            { sectionKey: 'modelConfiguration', sectionName: 'Model Configuration', isExpanded: true },
            { sectionKey: 'executionTimeline', sectionName: 'Execution Timeline', isExpanded: true },
            { sectionKey: 'resourceUsage', sectionName: 'Resource Usage', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

