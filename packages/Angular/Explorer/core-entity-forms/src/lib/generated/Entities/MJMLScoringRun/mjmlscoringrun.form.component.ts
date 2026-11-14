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
            { sectionKey: 'modelAndConfiguration', sectionName: 'Model and Configuration', isExpanded: true },
            { sectionKey: 'scoringScopeAndParameters', sectionName: 'Scoring Scope and Parameters', isExpanded: true },
            { sectionKey: 'requestAndExecutionContext', sectionName: 'Request and Execution Context', isExpanded: true },
            { sectionKey: 'statusAndResults', sectionName: 'Status and Results', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

