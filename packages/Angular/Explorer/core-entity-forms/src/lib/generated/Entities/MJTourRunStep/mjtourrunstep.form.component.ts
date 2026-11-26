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
            { sectionKey: 'runExecution', sectionName: 'Run Execution', isExpanded: true },
            { sectionKey: 'timingAndTimeline', sectionName: 'Timing and Timeline', isExpanded: true },
            { sectionKey: 'stepOutcomes', sectionName: 'Step Outcomes', isExpanded: true },
            { sectionKey: 'diagnostics', sectionName: 'Diagnostics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

