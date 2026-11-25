import { Component } from '@angular/core';
import { MJTourRunStepEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tour Run Steps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtourrunstep-form',
    templateUrl: './mjtourrunstep.form.component.html'
})
export class MJTourRunStepFormComponent extends BaseFormComponent {
    public record!: MJTourRunStepEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'stepExecution', sectionName: 'Step Execution', isExpanded: true },
            { sectionKey: 'timingAndOutcomes', sectionName: 'Timing and Outcomes', isExpanded: true },
            { sectionKey: 'diagnosticsAndMetrics', sectionName: 'Diagnostics and Metrics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

