import { Component } from '@angular/core';
import { MJMLScoringRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Scoring Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlscoringrun-form',
    templateUrl: './mjmlscoringrun.form.component.html'
})
export class MJMLScoringRunFormComponent extends BaseFormComponent {
    public record!: MJMLScoringRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelAndExecutionDetails', sectionName: 'Model and Execution Details', isExpanded: true },
            { sectionKey: 'scopeAndConfiguration', sectionName: 'Scope and Configuration', isExpanded: true },
            { sectionKey: 'timelineAndRequestors', sectionName: 'Timeline and Requestors', isExpanded: true },
            { sectionKey: 'executionStatusAndResults', sectionName: 'Execution Status and Results', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

